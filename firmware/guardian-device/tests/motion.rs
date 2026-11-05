//! Motion durability and ordering tests.

use std::cell::RefCell;
use std::rc::Rc;

use guardian_core::accel::{Accel, Threshold};
use guardian_core::error::{Error, Result};
use guardian_core::ports::{Latch, MotionSensor, SensorInfo};
use guardian_device::motion::{
    arm_for_sleep, capture_latched_motion, next_sequence, observe_motion, prepare_for_active_cycle,
    MotionObservation,
};
use guardian_device::outbox::PendingEvent;
use guardian_device::ports::{Clock, EventStore, PowerSampler};
use guardian_protocol::envelope::{encode_event, Kind, Power, PowerSource};
use guardian_protocol::identity::DeviceId;
use guardian_protocol::time::UtcTime;

type Operations = Rc<RefCell<Vec<&'static str>>>;

#[derive(Default)]
struct Store {
    pending: Option<PendingEvent>,
    last: Option<u32>,
    motion_watermark: u32,
    deferred: Option<u32>,
    operations: Operations,
}

impl EventStore for Store {
    fn load_pending(&mut self) -> Result<Option<PendingEvent>> {
        self.operations.borrow_mut().push("load_pending");
        Ok(self.pending.clone())
    }

    fn save_pending(&mut self, event: &PendingEvent) -> Result<()> {
        self.operations.borrow_mut().push("save_pending");
        self.pending = Some(event.clone());
        Ok(())
    }

    fn last_sequence(&mut self) -> Result<Option<u32>> {
        self.operations.borrow_mut().push("last_sequence");
        Ok(self.last)
    }

    fn commit_sequence(&mut self, sequence: u32) -> Result<()> {
        self.last = Some(sequence);
        Ok(())
    }

    fn clear_pending(&mut self) -> Result<()> {
        self.pending = None;
        Ok(())
    }

    fn defer_motion(&mut self) -> Result<u32> {
        self.operations.borrow_mut().push("defer_motion");
        let next = self.motion_watermark.checked_add(1).ok_or(Error::State)?;
        self.motion_watermark = next;
        self.deferred = Some(next);
        Ok(next)
    }

    fn deferred_motion_generation(&mut self) -> Result<Option<u32>> {
        self.operations
            .borrow_mut()
            .push("deferred_motion_generation");
        Ok(self.deferred)
    }

    fn clear_deferred_motion(&mut self, generation: u32) -> Result<()> {
        self.operations.borrow_mut().push("clear_deferred_motion");
        match self.deferred {
            None => Ok(()),
            Some(current) if current == generation => {
                self.deferred = None;
                Ok(())
            }
            Some(current) if current > generation => Ok(()),
            Some(_) => Err(Error::State),
        }
    }
}

struct Sensor {
    triggered: bool,
    relatch: bool,
    operations: Operations,
}

impl MotionSensor for Sensor {
    fn probe(&mut self) -> Result<SensorInfo> {
        self.operations.borrow_mut().push("probe");
        Ok(SensorInfo {
            address: 0x18,
            chip_id: 0x33,
        })
    }

    fn read(&mut self) -> Result<Accel> {
        unreachable!()
    }

    fn arm(&mut self, _threshold: Threshold) -> Result<()> {
        self.operations.borrow_mut().push("arm");
        Ok(())
    }

    fn is_triggered(&mut self) -> bool {
        self.triggered
    }

    fn acknowledge(&mut self) -> Result<Latch> {
        self.operations.borrow_mut().push("acknowledge");
        self.triggered = self.relatch;
        Ok(Latch {
            active: true,
            raw: 0x40,
        })
    }

    fn scan(&mut self, _found: &mut dyn FnMut(u8, u8)) {}
}

struct TestClock {
    now: Result<UtcTime>,
    operations: Operations,
}

impl Clock for TestClock {
    fn now(&mut self) -> Result<UtcTime> {
        self.operations.borrow_mut().push("clock");
        self.now
    }

    fn heartbeat_due(&mut self, _now: UtcTime) -> Result<bool> {
        Ok(false)
    }
}

struct TestPower {
    operations: Operations,
}

impl PowerSampler for TestPower {
    fn sample_power(&mut self) -> Result<Power> {
        self.operations.borrow_mut().push("power");
        Power::new(0, Some(4_000), PowerSource::Reserve).map_err(|_| Error::State)
    }
}

fn existing_pending() -> PendingEvent {
    let body = encode_event(
        &DeviceId::new("motion-test").unwrap(),
        7,
        Kind::Heartbeat,
        UtcTime::from_unix(1_700_000_000).unwrap(),
        Power::new(0, Some(4_000), PowerSource::Reserve).unwrap(),
    )
    .unwrap();
    PendingEvent::from_body(&body)
}

fn fixtures() -> (Store, Sensor, TestClock, TestPower, Operations) {
    let operations = Rc::new(RefCell::new(Vec::new()));
    (
        Store {
            operations: operations.clone(),
            ..Store::default()
        },
        Sensor {
            triggered: true,
            relatch: false,
            operations: operations.clone(),
        },
        TestClock {
            now: Ok(UtcTime::from_unix(1_700_000_001).unwrap()),
            operations: operations.clone(),
        },
        TestPower {
            operations: operations.clone(),
        },
        operations,
    )
}

#[test]
fn defers_before_ack_and_marks_the_staged_event() {
    let (mut store, mut sensor, mut clock, mut power, operations) = fixtures();
    let observation = observe_motion(
        &DeviceId::new("motion-test").unwrap(),
        false,
        &mut store,
        &mut sensor,
        &mut clock,
        &mut power,
    )
    .unwrap();
    assert_eq!(
        observation,
        MotionObservation {
            detected: true,
            event_staged: true,
        }
    );
    assert_eq!(store.deferred, Some(1));
    let pending = store.pending.as_ref().unwrap();
    assert_eq!(pending.sequence(), 1);
    assert_eq!(pending.deferred_motion_generation(), Some(1));
    let operations = operations.borrow();
    let defer = operations
        .iter()
        .position(|item| *item == "defer_motion")
        .unwrap();
    let ack = operations
        .iter()
        .position(|item| *item == "acknowledge")
        .unwrap();
    let save = operations
        .iter()
        .position(|item| *item == "save_pending")
        .unwrap();
    let probe = operations.iter().position(|item| *item == "probe").unwrap();
    assert!(defer < probe && probe < ack && ack < save);
    assert!(!operations.contains(&"clear_deferred_motion"));
}

#[test]
fn new_sequence_is_independent_of_network_time() {
    assert_eq!(next_sequence(None), Ok(1));
    assert_eq!(next_sequence(Some(41)), Ok(42));
}

#[test]
fn occupied_outbox_keeps_coalesced_motion_without_using_network_time() {
    let (mut store, mut sensor, mut clock, mut power, operations) = fixtures();
    store.pending = Some(existing_pending());
    assert_eq!(
        observe_motion(
            &DeviceId::new("motion-test").unwrap(),
            false,
            &mut store,
            &mut sensor,
            &mut clock,
            &mut power,
        ),
        Ok(MotionObservation {
            detected: true,
            event_staged: false,
        })
    );
    assert_eq!(store.deferred, Some(1));
    assert!(!operations.borrow().contains(&"clock"));
    assert!(!operations.borrow().contains(&"power"));
}

#[test]
fn recovered_deferred_motion_stages_after_slot_becomes_free() {
    let (mut store, mut sensor, mut clock, mut power, operations) = fixtures();
    store.motion_watermark = 7;
    store.deferred = Some(7);
    store.last = Some(9);
    sensor.triggered = false;
    let observation = observe_motion(
        &DeviceId::new("motion-test").unwrap(),
        false,
        &mut store,
        &mut sensor,
        &mut clock,
        &mut power,
    )
    .unwrap();
    assert!(observation.detected && observation.event_staged);
    assert_eq!(store.pending.as_ref().unwrap().sequence(), 10);
    assert!(!operations.borrow().contains(&"acknowledge"));
}

#[test]
fn clock_failure_preserves_deferred_motion() {
    let (mut store, mut sensor, mut clock, mut power, operations) = fixtures();
    clock.now = Err(Error::Timeout);
    assert_eq!(
        observe_motion(
            &DeviceId::new("motion-test").unwrap(),
            true,
            &mut store,
            &mut sensor,
            &mut clock,
            &mut power,
        ),
        Err(Error::Timeout)
    );
    assert_eq!(store.deferred, Some(1));
    assert!(store.pending.is_none());
    assert!(!operations.borrow().contains(&"clear_deferred_motion"));
}

#[test]
fn arm_race_is_deferred_before_the_latch_is_cleared() {
    let (mut store, mut sensor, _, _, operations) = fixtures();
    assert!(
        arm_for_sleep(&mut store, &mut sensor, Threshold::DEFAULT, || {
            operations.borrow_mut().push("settle");
        })
        .unwrap()
    );
    assert_eq!(store.deferred, Some(1));
    assert_eq!(
        operations.borrow().as_slice(),
        ["probe", "arm", "defer_motion", "acknowledge", "settle"]
    );
}

#[test]
fn continuous_relatch_during_active_prepare_can_still_stage_an_alert() {
    let (mut store, mut sensor, mut clock, mut power, operations) = fixtures();
    sensor.relatch = true;
    assert!(
        prepare_for_active_cycle(&mut store, &mut sensor, Threshold::DEFAULT, || {
            operations.borrow_mut().push("settle");
        })
        .unwrap()
    );
    assert!(sensor.triggered);
    assert_eq!(store.deferred, Some(1));

    let observed = observe_motion(
        &DeviceId::new("motion-test").unwrap(),
        false,
        &mut store,
        &mut sensor,
        &mut clock,
        &mut power,
    )
    .unwrap();
    assert_eq!(
        observed,
        MotionObservation {
            detected: true,
            event_staged: true,
        }
    );
    assert_eq!(store.deferred, Some(2));
    assert_eq!(
        store.pending.as_ref().unwrap().deferred_motion_generation(),
        Some(2)
    );
}

#[test]
fn arm_refuses_sleep_when_motion_relatches() {
    let (mut store, mut sensor, _, _, _) = fixtures();
    sensor.relatch = true;
    assert_eq!(
        arm_for_sleep(&mut store, &mut sensor, Threshold::DEFAULT, || {}),
        Err(Error::State)
    );
    assert_eq!(store.deferred, Some(1));
}

#[test]
fn final_pre_sleep_capture_does_not_reconfigure_the_sensor() {
    let (mut store, mut sensor, _, _, operations) = fixtures();
    assert!(capture_latched_motion(&mut store, &mut sensor, || {
        operations.borrow_mut().push("settle");
    })
    .unwrap());
    assert_eq!(
        operations.borrow().as_slice(),
        ["defer_motion", "acknowledge", "settle"]
    );
    assert_eq!(store.deferred, Some(1));
}
