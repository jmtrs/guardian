//! [`Uplink`] over the A7670's own TCP/IP stack: network clock and HTTPS
//! `POST` with `AT+HTTP*` (`SIMCom` A76XX HTTP(S) application note).
//!
//! Bench limitation: the server certificate is **not verified**
//! (`authmode 0`). The HMAC still authenticates every event and the backend
//! rejects tampering, but the body is readable by a man in the middle.
//! Production must load the CA and verify (`authmode 1`).

use std::time::Duration;

use guardian_core::ports::{DeviceRequest, Modem, Uplink};
use guardian_core::Error;
use guardian_drivers::simcom::{parse_cclk, parse_http_action};
use guardian_protocol::time::UtcTime;

use super::A7670;

const SHORT: Duration = Duration::from_secs(2);
/// `AT+HTTPDATA` input window, in ms, and our wait for its result.
const UPLOAD_WINDOW_MS: u32 = 10_000;
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(12);
/// Connect + TLS + request + response, as the modem reports it.
const ACTION_WAIT: Duration = Duration::from_secs(60);
/// NTP server for the modem clock. Plain NTP is unauthenticated: it only
/// feeds `observedAtUtc`, and the bench sequence (UTC seconds) is checked
/// against replay by the backend, which accepts only increasing values.
const NTP_SERVER: &str = "pool.ntp.org";
const NTP_WAIT: Duration = Duration::from_secs(20);
/// Device-channel user agent: Cloudflare blocks unknown or empty ones.
const USER_AGENT: &str = "Guardian-Device/2";

/// SSL context 0: any TLS version, SNI on (required behind Cloudflare),
/// no certificate verification (see module docs).
const TLS_SETUP: [&str; 3] = [
    r#"AT+CSSLCFG="sslversion",0,4"#,
    r#"AT+CSSLCFG="authmode",0,0"#,
    r#"AT+CSSLCFG="enableSNI",0,1"#,
];

impl Uplink for A7670 {
    fn network_time(&mut self) -> Result<UtcTime, Error> {
        // Always resync before signing. Found on unit 1: Orange ES sends no
        // NITZ, and after a modem power cycle the clock resumes from an old,
        // plausible-looking time instead of its 1970 default, so a parsable
        // `+CCLK` proves nothing. A stale clock made the bench sequence go
        // backwards (409 replay). NTP over the data bearer sets UTC (zone 0).
        self.command(&format!(r#"AT+CNTP="{NTP_SERVER}",0"#), SHORT)?;
        let result = self.at.query("AT+CNTP", "+CNTP:", SHORT, NTP_WAIT)?;
        if result.trim_end() != "+CNTP: 0" {
            log::warn!("NTP sync failed: {result}");
            return Err(Error::Rejected);
        }
        self.read_clock()?.ok_or(Error::State)
    }

    fn post(&mut self, request: &DeviceRequest<'_>) -> Result<u16, Error> {
        // A session left open by an aborted attempt makes HTTPINIT fail.
        let _ = self.command("AT+HTTPTERM", SHORT);
        let result = self.http_post(request);
        let _ = self.command("AT+HTTPTERM", SHORT);
        result
    }
}

impl A7670 {
    /// The modem clock in UTC, `None` while it was never set.
    fn read_clock(&mut self) -> Result<Option<UtcTime>, Error> {
        let line = self.at.query("AT+CCLK?", "+CCLK:", SHORT, SHORT)?;
        Ok(parse_cclk(&line))
    }

    fn http_post(&mut self, request: &DeviceRequest<'_>) -> Result<u16, Error> {
        for line in TLS_SETUP {
            self.command(line, SHORT)?;
        }
        self.command("AT+HTTPINIT", SHORT)?;
        self.command(
            &format!(r#"AT+HTTPPARA="URL","{}{}""#, self.backend, request.path),
            SHORT,
        )?;
        self.command(r#"AT+HTTPPARA="CONTENT","application/json""#, SHORT)?;
        self.command(r#"AT+HTTPPARA="SSLCFG",0"#, SHORT)?;
        // One header per USERDATA: this firmware appends each call, but sends
        // a `\r\n` inside one value literally (checked on unit 1 against an
        // echo service). It sends no User-Agent of its own.
        for header in [
            format!("X-Device-Id: {}", request.device_id),
            format!("X-Guardian-Signature: {}", request.signature),
            format!("User-Agent: {USER_AGENT}"),
        ] {
            self.command(&format!(r#"AT+HTTPPARA="USERDATA","{header}""#), SHORT)?;
        }
        self.at.command_with_payload(
            &format!("AT+HTTPDATA={},{UPLOAD_WINDOW_MS}", request.body.len()),
            request.body,
            UPLOAD_TIMEOUT,
        )?;
        let line = self
            .at
            .query("AT+HTTPACTION=1", "+HTTPACTION:", SHORT, ACTION_WAIT)?;
        let action = parse_http_action(&line).ok_or(Error::Rejected)?;
        if !action.reached_server() {
            log::warn!("HTTP transport error {} (SIMCom 7xx code)", action.status);
            return Err(Error::Rejected);
        }
        if action.status != 202 && action.length > 0 {
            // The sink prints the response body: the backend's reason.
            let _ = self.command(&format!("AT+HTTPREAD=0,{}", action.length), SHORT);
        }
        Ok(action.status)
    }
}
