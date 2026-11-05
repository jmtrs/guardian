//! Durable outbox failure and retry tests.

use guardian_core::error::{Error, Result};
use guardian_device::outbox::{drain, stage, DrainOutcome, PendingEvent, Receipt};
use guardian_device::ports::{EventStore, EventUplink};
use guardian_protocol::envelope::{encode_event, Kind, Power, PowerSource};
use guardian_protocol::identity::DeviceId;
use guardian_protocol::time::UtcTime;

#[derive(Default)]
struct Store {
    pending: Option<PendingEvent>,
    last: Option<u32>,
    deferred_motion: bool,
    operations: Vec<&'static str>,
}

impl EventStore for Store {
    fn load_pending(&mut self) -> Result<Option<PendingEvent>> {
        Ok(self.pending.clone())
    }

    fn save_pending(&mut self, event: &PendingEvent) -> Result<()> {
        self.operations.push("save");
        self.pending = Some(event.clone());
        Ok(())
    }

    fn last_sequence(&mut self) -> Result<Option<u32>> {
        Ok(self.last)
    }

    fn commit_sequence(&mut self, sequence: u32) -> Result<()> {
        self.operations.push("commit");
        self.last = Some(sequence);
        Ok(())
    }

    fn clear_pending(&mut self) -> Result<()> {
        self.operations.push("clear");
        self.pending = None;
        Ok(())
    }

    fn defer_motion(&mut self) -> Result<()> {
        self.operations.push("defer_motion");
        self.deferred_motion = true;
        Ok(())
    }

    fn motion_deferred(&mut self) -> Result<bool> {
        Ok(self.deferred_motion)
    }

    fn clear_deferred_motion(&mut self) -> Result<()> {
        self.operations.push("clear_deferred_motion");
        self.deferred_motion = false;
        Ok(())
    }
}

struct Uplink {
    answers: Vec<Result<u16>>,
    bodies: Vec<Vec<u8>>,
}

impl EventUplink for Uplink {
    fn post_event(&mut self, body: &[u8]) -> Result<u16> {
        self.bodies.push(body.to_vec());
        self.answers.remove(0)
    }
}

fn body(sequence: u32) -> guardian_protocol::envelope::Body {
    encode_event(
        &DeviceId::new("device-test").unwrap(),
        sequence,
        Kind::Heartbeat,
        UtcTime::from_unix(1_700_000_000).unwrap(),
        Power::new(12_500, Some(4_000), PowerSource::Vehicle).unwrap(),
    )
    .unwrap()
}

#[test]
fn persists_before_send_and_retries_identical_bytes() {
    let mut store = Store::default();
    let encoded = body(7);
    let expected = encoded.as_bytes().to_vec();
    stage(&mut store, &encoded).unwrap();
    assert_eq!(store.operations, ["save"]);
    let mut uplink = Uplink {
        answers: vec![Err(Error::Timeout), Ok(503), Ok(202)],
        bodies: Vec::new(),
    };

    assert_eq!(drain(&mut store, &mut uplink), Ok(DrainOutcome::Retained));
    assert_eq!(drain(&mut store, &mut uplink), Ok(DrainOutcome::Retained));
    assert_eq!(
        drain(&mut store, &mut uplink),
        Ok(DrainOutcome::Delivered {
            sequence: 7,
            receipt: Receipt::Accepted,
        })
    );
    assert_eq!(
        uplink.bodies,
        [expected.clone(), expected.clone(), expected]
    );
    assert_eq!(store.operations, ["save", "commit", "clear"]);
}

#[test]
fn conflict_is_terminal_after_a_lost_accept_response() {
    let mut store = Store::default();
    stage(&mut store, &body(8)).unwrap();
    let mut uplink = Uplink {
        answers: vec![Ok(409)],
        bodies: Vec::new(),
    };
    assert_eq!(
        drain(&mut store, &mut uplink),
        Ok(DrainOutcome::Delivered {
            sequence: 8,
            receipt: Receipt::AlreadyRecorded,
        })
    );
    assert_eq!(store.last, Some(8));
    assert!(store.pending.is_none());
}

#[test]
fn never_overwrites_pending_or_reuses_a_sequence() {
    let mut store = Store::default();
    stage(&mut store, &body(9)).unwrap();
    assert_eq!(stage(&mut store, &body(10)), Err(Error::State));
    store.pending = None;
    store.last = Some(9);
    assert_eq!(stage(&mut store, &body(9)), Err(Error::State));
}
