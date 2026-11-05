//! Step 7: signed heartbeat through the uplink port.

mod support;

use guardian_core::bringup::DeviceIdentity;
use guardian_core::Error;
use guardian_protocol::identity::{Context, DeviceId, RootSecret};
use guardian_protocol::time::UtcTime;
use support::Fake;

const ROOT: &str = "00000000000000000000000000000000ffffffffffffffffffffffffffffffff";
const ID: &str = "dev-test-1";

fn identity() -> DeviceIdentity {
    DeviceIdentity::new(
        DeviceId::new(ID).unwrap(),
        &RootSecret::from_hex(ROOT).unwrap(),
    )
}

#[test]
fn sends_a_heartbeat_signed_over_the_exact_body() {
    let fake = Fake::default();
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Ok(202));
    let w = fake.world();
    let [post] = w.posts.as_slice() else {
        panic!("one post expected, got {}", w.posts.len());
    };
    assert_eq!(post.path, "/v1/events");
    assert_eq!(post.device_id, ID);
    assert_eq!(
        post.body,
        r#"{"schemaVersion":2,"deviceId":"dev-test-1","sequence":1,"kind":"heartbeat","observedAtUtc":"2026-11-05T11:30:00Z","power":{"vehicleMv":0,"source":"reserve","reserveMv":4100}}"#
    );
    let key = RootSecret::from_hex(ROOT)
        .unwrap()
        .derive(&DeviceId::new(ID).unwrap(), Context::Event);
    assert_eq!(
        post.signature,
        key.sign(post.body.as_bytes()).hex().as_str()
    );
    drop(w);
    assert!(fake.printed("backend: HTTP 202 (accepted)"));
}

#[test]
fn refuses_without_identity_and_sends_nothing() {
    let fake = Fake::default();
    assert_eq!(fake.service().send_heartbeat(), Err(Error::State));
    assert!(fake.world().posts.is_empty());
    assert!(fake.printed("no device identity"));
}

#[test]
fn reports_a_replayed_sequence() {
    let fake = Fake::with(|w| w.post_status = Ok(409));
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Err(Error::Rejected));
    assert!(fake.printed("HTTP 409 (replayed or stale sequence)"));
}

#[test]
fn needs_network_time_before_signing() {
    let fake = Fake::with(|w| w.network_time = Err(Error::State));
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Err(Error::State));
    assert!(fake.world().posts.is_empty());
    assert!(fake.printed("network time unavailable"));
}

#[test]
fn reports_a_failed_exchange() {
    let fake = Fake::with(|w| w.post_status = Err(Error::Timeout));
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Err(Error::Timeout));
    assert!(fake.printed("no HTTP exchange: timeout"));
}

#[test]
fn omits_reserve_reading_when_the_adc_is_unavailable() {
    let fake = Fake::with(|w| w.battery = None);
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Ok(202));
    assert!(fake.world().posts[0]
        .body
        .ends_with(r#""power":{"vehicleMv":0,"source":"reserve"}}"#));
}

#[test]
fn console_runs_the_event() {
    let fake = Fake::default();
    let mut s = fake.service().with_identity(identity());
    s.handle_line("!event");
    assert_eq!(fake.world().posts.len(), 1);
    let _ = UtcTime::from_unix(0);
}
