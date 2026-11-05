//! Durable pending-record codec tests.

use guardian_core::error::Error;
use guardian_device::outbox::PendingEvent;
use guardian_device::record::{decode_pending, encode_pending};
use guardian_protocol::envelope::{encode_event, Kind, Power, PowerSource};
use guardian_protocol::identity::DeviceId;
use guardian_protocol::time::UtcTime;

fn pending() -> PendingEvent {
    let body = encode_event(
        &DeviceId::new("record-test").unwrap(),
        42,
        Kind::SuspectedMovement,
        UtcTime::from_unix(1_700_000_000).unwrap(),
        Power::new(0, Some(4_050), PowerSource::Reserve).unwrap(),
    )
    .unwrap();
    PendingEvent::from_deferred_motion(&body, 7).unwrap()
}

#[test]
fn round_trip_preserves_sequence_and_exact_body() {
    let pending = pending();
    let encoded = encode_pending(&pending);
    let decoded = decode_pending(encoded.as_bytes()).unwrap();
    assert_eq!(decoded, pending);
    assert_eq!(decoded.deferred_motion_generation(), Some(7));
}

#[test]
fn rejects_bit_flip_truncation_and_trailing_bytes() {
    let encoded = encode_pending(&pending());
    let mut corrupt = encoded.as_bytes().to_vec();
    corrupt[16] ^= 1;
    assert_eq!(decode_pending(&corrupt), Err(Error::State));
    assert_eq!(
        decode_pending(&encoded.as_bytes()[..encoded.as_bytes().len() - 1]),
        Err(Error::State)
    );
    let mut trailing = encoded.as_bytes().to_vec();
    trailing.push(0);
    assert_eq!(decode_pending(&trailing), Err(Error::State));
}

#[test]
fn rejects_unknown_magic_and_version() {
    let encoded = encode_pending(&pending());
    let mut wrong_magic = encoded.as_bytes().to_vec();
    wrong_magic[0] = b'X';
    assert_eq!(decode_pending(&wrong_magic), Err(Error::State));
    let mut wrong_version = encoded.as_bytes().to_vec();
    wrong_version[4] = 2;
    assert_eq!(decode_pending(&wrong_version), Err(Error::State));
    let mut wrong_flags = encoded.as_bytes().to_vec();
    wrong_flags[5] = 0x80;
    assert_eq!(decode_pending(&wrong_flags), Err(Error::State));
}

#[test]
fn rejects_inconsistent_motion_generation_metadata() {
    let encoded = encode_pending(&pending());
    let mut missing_flag = encoded.as_bytes().to_vec();
    missing_flag[5] = 0;
    assert_eq!(decode_pending(&missing_flag), Err(Error::State));

    let mut zero_generation = encoded.as_bytes().to_vec();
    zero_generation[10..14].copy_from_slice(&0u32.to_le_bytes());
    assert_eq!(decode_pending(&zero_generation), Err(Error::State));
}
