//! Byte-for-byte agreement with the Python reference (`guardian/protocol.py`),
//! whose output the backend accepts. Vectors generated with:
//!
//! ```text
//! root = "00" * 16 + "ff" * 16
//! derive_key(root, "dev-test-1", "event")
//! encode_event("dev-test-1", 1793800000, "heartbeat",
//!              build_power(0, "reserve", 3804),
//!              observed_at="2026-11-05T11:30:00Z")
//! ```

use guardian_protocol::envelope::{encode_event, Kind, Power, PowerSource};
use guardian_protocol::identity::{Context, DeviceId, RootSecret};
use guardian_protocol::time::UtcTime;
use guardian_protocol::ProtocolError;

const ROOT: &str = "00000000000000000000000000000000ffffffffffffffffffffffffffffffff";
const K_EVENT: &str = "102faba9d19a3c87f1acf0678cf2fab8d808ba4a4a2e53f4c8e05ad6dcc39278";
const BODY: &str = r#"{"schemaVersion":2,"deviceId":"dev-test-1","sequence":1793800000,"kind":"heartbeat","observedAtUtc":"2026-11-05T11:30:00Z","power":{"vehicleMv":0,"source":"reserve","reserveMv":3804}}"#;
const SIGNATURE: &str = "e4d5b99c16c50858f2a438cb3fd8a71e2d1d927ad3841d42ee5ff39528a733f4";

fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes.iter().fold(String::new(), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })
}

fn device() -> DeviceId {
    DeviceId::new("dev-test-1").unwrap()
}

#[test]
fn event_key_matches_reference() {
    let key = RootSecret::from_hex(ROOT)
        .unwrap()
        .derive(&device(), Context::Event);
    assert_eq!(hex(key.expose()), K_EVENT);
}

#[test]
fn contexts_get_distinct_keys() {
    let root = RootSecret::from_hex(ROOT).unwrap();
    let event = root.derive(&device(), Context::Event);
    let command = root.derive(&device(), Context::Command);
    let ble = root.derive(&device(), Context::Ble);
    assert_ne!(event.expose(), command.expose());
    assert_ne!(command.expose(), ble.expose());
}

#[test]
fn body_and_signature_match_reference() {
    let observed = UtcTime::from_civil(2026, 11, 5, 11, 30, 0).unwrap();
    let power = Power::new(0, Some(3804), PowerSource::Reserve).unwrap();
    let body = encode_event(&device(), 1_793_800_000, Kind::Heartbeat, observed, power).unwrap();
    assert_eq!(core::str::from_utf8(body.as_bytes()).unwrap(), BODY);
    let key = RootSecret::from_hex(ROOT)
        .unwrap()
        .derive(&device(), Context::Event);
    assert_eq!(key.sign(body.as_bytes()).to_string(), SIGNATURE);
}

#[test]
fn reserve_reading_is_optional() {
    let observed = UtcTime::from_unix(0).unwrap();
    let power = Power::new(12_400, None, PowerSource::Vehicle).unwrap();
    let body = encode_event(&device(), 7, Kind::PowerLost, observed, power).unwrap();
    assert!(core::str::from_utf8(body.as_bytes())
        .unwrap()
        .ends_with(r#""power":{"vehicleMv":12400,"source":"vehicle"}}"#));
}

#[test]
fn sequence_must_be_in_backend_range() {
    let observed = UtcTime::from_unix(0).unwrap();
    let power = Power::new(0, None, PowerSource::Unknown).unwrap();
    for bad in [0, 1 << 31] {
        assert_eq!(
            encode_event(&device(), bad, Kind::Heartbeat, observed, power).err(),
            Some(ProtocolError::Sequence)
        );
    }
}

#[test]
fn rejects_values_the_backend_would_reject() {
    assert_eq!(
        Power::new(60_001, None, PowerSource::Vehicle),
        Err(ProtocolError::Millivolts)
    );
    assert_eq!(DeviceId::new("a\"b").err(), Some(ProtocolError::DeviceId));
    assert_eq!(DeviceId::new("").err(), Some(ProtocolError::DeviceId));
    assert_eq!(
        DeviceId::new(&"x".repeat(41)).err(),
        Some(ProtocolError::DeviceId)
    );
    assert!(RootSecret::from_hex(&ROOT[..62]).is_err());
    assert!(RootSecret::from_hex(&ROOT.replace('f', "g")).is_err());
}

#[test]
fn secrets_never_print() {
    let root = RootSecret::from_hex(ROOT).unwrap();
    assert_eq!(format!("{root:?}"), "RootSecret(<redacted>)");
    let key = root.derive(&device(), Context::Event);
    assert_eq!(format!("{key:?}"), "ChannelKey(<redacted>)");
}
