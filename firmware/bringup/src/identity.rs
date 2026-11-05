//! Bench device identity, injected at build time.
//!
//! `GUARDIAN_DEVICE_ID` and `GUARDIAN_DEVICE_SECRET_HEX` (what provisioning
//! prints) are read from the build environment and compiled into this
//! binary, which never enters git. Production stores them in NVS/eFuse at
//! manufacturing instead. Without them `!event` explains how to build.

use guardian_core::bringup::DeviceIdentity;
use guardian_protocol::identity::{DeviceId, RootSecret};
use guardian_protocol::ProtocolError;

/// Backend base URL, overridable at build time (`GUARDIAN_BACKEND_URL`).
pub const BACKEND_URL: &str = match option_env!("GUARDIAN_BACKEND_URL") {
    Some(url) => url,
    None => "https://gtapi.aggc.dev",
};

/// The identity compiled in, if any; `Err` if it is present but malformed.
pub fn from_build() -> Option<Result<DeviceIdentity, ProtocolError>> {
    let id = option_env!("GUARDIAN_DEVICE_ID")?;
    let secret = option_env!("GUARDIAN_DEVICE_SECRET_HEX")?;
    Some(DeviceId::new(id).and_then(|device| {
        RootSecret::from_hex(secret).map(|root| DeviceIdentity::new(device, &root))
    }))
}
