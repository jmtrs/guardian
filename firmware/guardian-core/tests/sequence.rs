//! Event sequence persistence and identity provisioning.

mod support;

use guardian_core::bringup::{next_sequence, DeviceIdentity};
use guardian_core::Error;
use guardian_protocol::identity::{DeviceId, RootSecret};
use support::Fake;

const ROOT: &str = "00000000000000000000000000000000ffffffffffffffffffffffffffffffff";

fn identity() -> DeviceIdentity {
    DeviceIdentity::new(
        DeviceId::new("dev-test-1").unwrap(),
        &RootSecret::from_hex(ROOT).unwrap(),
    )
}

#[test]
fn next_sequence_increments_or_starts_at_one() {
    assert_eq!(next_sequence(Some(41)), Ok(42));
    assert_eq!(next_sequence(None), Ok(1));
    assert_eq!(next_sequence(Some((1 << 31) - 1)), Err(Error::State));
    assert_eq!(next_sequence(Some(u32::MAX)), Err(Error::State));
}

#[test]
fn sequence_is_stored_before_the_event_leaves() {
    let fake = Fake::with(|w| w.last_sequence = Ok(Some(1_793_880_497)));
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Ok(202));
    assert_eq!(s.send_heartbeat(), Ok(202));
    let w = fake.world();
    // (sequence, posts already made when it was stored)
    assert_eq!(w.stored_sequences, [(1_793_880_498, 0), (1_793_880_499, 1)]);
    assert!(w.posts[1].body.contains(r#""sequence":1793880499"#));
}

#[test]
fn a_failed_send_never_reuses_its_sequence() {
    let fake = Fake::with(|w| w.post_status = Err(Error::Timeout));
    let mut s = fake.service().with_identity(identity());
    let _ = s.send_heartbeat();
    fake.0.borrow_mut().post_status = Ok(202);
    assert_eq!(s.send_heartbeat(), Ok(202));
    let w = fake.world();
    assert_eq!(w.stored_sequences[1].0, w.stored_sequences[0].0 + 1);
}

#[test]
fn unreadable_storage_refuses_to_send() {
    let fake = Fake::with(|w| w.last_sequence = Err(Error::Io));
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Err(Error::Io));
    assert!(fake.world().posts.is_empty());
    assert!(fake.printed("sequence storage unreadable"));
}

#[test]
fn unstorable_sequence_refuses_to_send() {
    let fake = Fake::with(|w| w.store_sequence_result = Err(Error::Io));
    let mut s = fake.service().with_identity(identity());
    assert_eq!(s.send_heartbeat(), Err(Error::Io));
    assert!(fake.world().posts.is_empty());
    assert!(fake.printed("sequence not stored, not sending"));
}

#[test]
fn provision_stores_identity_and_enables_events() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.handle_line(&format!("!provision dev-test-1 {ROOT}"));
    assert_eq!(
        fake.world().stored_identity,
        Some(("dev-test-1".to_owned(), ROOT.to_owned()))
    );
    assert!(
        !fake.world().out.contains(ROOT),
        "secret must never be printed"
    );
    assert_eq!(s.send_heartbeat(), Ok(202));
    assert_eq!(fake.world().posts[0].device_id, "dev-test-1");
}

#[test]
fn provision_refuses_invalid_input_without_storing() {
    let fake = Fake::default();
    let mut s = fake.service();
    assert_eq!(s.provision("bad id", ROOT), Err(Error::State));
    assert_eq!(s.provision("dev-1", "abc"), Err(Error::State));
    assert_eq!(fake.world().stored_identity, None);
    assert!(fake.printed("provision refused"));
}

#[test]
fn reprovisioning_the_same_device_keeps_counting() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.handle_line(&format!("!provision dev-test-1 {ROOT}"));
    assert_eq!(s.send_heartbeat(), Ok(202));
    s.handle_line(&format!("!provision dev-test-1 {ROOT}"));
    assert_eq!(s.send_heartbeat(), Ok(202));
    let w = fake.world();
    assert_eq!(w.stored_sequences[1].0, w.stored_sequences[0].0 + 1);
}

#[test]
fn provisioning_another_device_restarts_from_one() {
    let fake = Fake::with(|w| {
        w.stored_identity = Some(("old-device".to_owned(), ROOT.to_owned()));
        w.last_sequence = Ok(Some(5));
    });
    let mut s = fake.service();
    s.handle_line(&format!("!provision dev-test-1 {ROOT}"));
    assert_eq!(s.send_heartbeat(), Ok(202));
    assert_eq!(fake.world().stored_sequences[0].0, 1);
}
