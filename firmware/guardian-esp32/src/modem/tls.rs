//! HTTPS trust: the server certificate is verified against a bundle of root
//! CAs compiled into the firmware (`certs/guardian-ca.pem`). The bundle is
//! uploaded once into the modem's file system and reused; changing it means
//! a new file name, so a stale copy is never trusted.

use std::time::Duration;

use guardian_core::ports::Modem;
use guardian_core::Error;

use super::transport::Prompt;
use super::A7670;

/// File name in the modem; bump the version with every bundle change.
const CA_FILE: &str = "guardian_ca_v1.pem";
/// `AT+CCERTLIST` line that proves [`CA_FILE`] is present.
const CA_LISTED: &str = "+CCERTLIST: \"guardian_ca_v1.pem\"";
const CA_BUNDLE: &str = include_str!("../../certs/guardian-ca.pem");
const SHORT: Duration = Duration::from_secs(2);
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(10);

impl A7670 {
    /// Configure SSL context 0: any TLS version, SNI (Cloudflare needs it),
    /// server verification against the bundle, certificate dates checked
    /// against the modem clock (synced by NTP before every event).
    pub(super) fn ensure_tls(&mut self) -> Result<(), Error> {
        if !self.ca_installed() {
            self.install_ca()?;
        }
        for line in [
            r#"AT+CSSLCFG="sslversion",0,4"#,
            r#"AT+CSSLCFG="enableSNI",0,1"#,
            &format!(r#"AT+CSSLCFG="cacert",0,"{CA_FILE}""#),
            r#"AT+CSSLCFG="ignorelocaltime",0,0"#,
            r#"AT+CSSLCFG="authmode",0,1"#,
        ] {
            self.command(line, SHORT)?;
        }
        Ok(())
    }

    fn ca_installed(&mut self) -> bool {
        self.at
            .query("AT+CCERTLIST", CA_LISTED, SHORT, Duration::ZERO)
            .is_ok()
    }

    fn install_ca(&mut self) -> Result<(), Error> {
        // Comment lines are for humans; upload only the PEM blocks.
        let pem: String = CA_BUNDLE
            .lines()
            .filter(|line| !line.starts_with('#'))
            .flat_map(|line| [line, "\n"])
            .collect();
        log::info!("installing CA bundle {CA_FILE} ({} bytes)", pem.len());
        self.at.command_with_payload(
            &format!(r#"AT+CCERTDOWN="{CA_FILE}",{}"#, pem.len()),
            Prompt::Byte(b'>'),
            pem.as_bytes(),
            UPLOAD_TIMEOUT,
        )
    }
}
