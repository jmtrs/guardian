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
        let line = self.at.query("AT+CCLK?", "+CCLK:", SHORT, SHORT)?;
        parse_cclk(&line).ok_or(Error::State)
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
        // `\r\n` is literal here: the modem expands it between headers.
        self.command(
            &format!(
                r#"AT+HTTPPARA="USERDATA","X-Device-Id: {}\r\nX-Guardian-Signature: {}\r\nUser-Agent: {USER_AGENT}""#,
                request.device_id, request.signature
            ),
            SHORT,
        )?;
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
