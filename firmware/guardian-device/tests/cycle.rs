//! Production wake-cycle ordering tests.

use guardian_core::error::Error;
use guardian_device::cycle::{DeviceCycle, Stage, StepResult};

#[test]
fn full_cycle_orders_delivery_motion_commands_location_heartbeat_and_sleep() {
    let mut cycle = DeviceCycle::new(true);
    let transitions = [
        (StepResult::Done, Stage::DrainOutbox),
        (StepResult::OutboxReady, Stage::ObserveMotion),
        (
            StepResult::MotionHandled {
                detected: false,
                durable: false,
            },
            Stage::PollCommands,
        ),
        (
            StepResult::Commands {
                locate_requested: true,
            },
            Stage::OptionalLocate,
        ),
        (StepResult::EventStaged, Stage::DrainOutbox),
        (StepResult::OutboxReady, Stage::HeartbeatIfDue),
        (StepResult::EventStaged, Stage::DrainOutbox),
        (StepResult::OutboxReady, Stage::Arm),
        (StepResult::Done, Stage::Sleep),
        (StepResult::Done, Stage::Complete),
    ];
    for (result, expected) in transitions {
        assert_eq!(cycle.advance(result), Ok(expected));
    }
}

#[test]
fn drains_new_motion_event_before_polling_commands() {
    let mut cycle = DeviceCycle::new(false);
    cycle.advance(StepResult::Done).unwrap();
    cycle.advance(StepResult::OutboxReady).unwrap();
    assert_eq!(
        cycle.advance(StepResult::MotionHandled {
            detected: true,
            durable: true,
        }),
        Ok(Stage::DrainOutbox)
    );
    assert_eq!(
        cycle.advance(StepResult::Commands {
            locate_requested: false,
        }),
        Err(Error::State)
    );
    assert_eq!(
        cycle.advance(StepResult::OutboxReady),
        Ok(Stage::PollCommands)
    );
}

#[test]
fn retained_new_event_stops_later_producers() {
    let mut cycle = DeviceCycle::new(true);
    cycle.advance(StepResult::Done).unwrap();
    cycle.advance(StepResult::OutboxReady).unwrap();
    cycle
        .advance(StepResult::MotionHandled {
            detected: false,
            durable: false,
        })
        .unwrap();
    cycle
        .advance(StepResult::Commands {
            locate_requested: true,
        })
        .unwrap();
    assert_eq!(
        cycle.advance(StepResult::EventStaged),
        Ok(Stage::DrainOutbox)
    );
    assert_eq!(cycle.advance(StepResult::OutboxRetained), Ok(Stage::Arm));
}

#[test]
fn heartbeat_must_persist_an_event_before_sleep() {
    let mut cycle = DeviceCycle::new(true);
    cycle.advance(StepResult::Done).unwrap();
    cycle.advance(StepResult::OutboxReady).unwrap();
    cycle
        .advance(StepResult::MotionHandled {
            detected: false,
            durable: false,
        })
        .unwrap();
    assert_eq!(
        cycle.advance(StepResult::Commands {
            locate_requested: false,
        }),
        Ok(Stage::HeartbeatIfDue)
    );
    assert_eq!(cycle.advance(StepResult::Done), Err(Error::State));
    assert_eq!(
        cycle.advance(StepResult::EventStaged),
        Ok(Stage::DrainOutbox)
    );
    assert_eq!(cycle.advance(StepResult::OutboxReady), Ok(Stage::Arm));
}

#[test]
fn retained_outbox_clears_motion_latch_then_blocks_new_producers() {
    let mut cycle = DeviceCycle::new(false);
    cycle.advance(StepResult::Done).unwrap();
    assert_eq!(
        cycle.advance(StepResult::OutboxRetained),
        Ok(Stage::ObserveMotion)
    );
    assert_eq!(
        cycle.advance(StepResult::MotionHandled {
            detected: true,
            durable: true,
        }),
        Ok(Stage::Arm)
    );
    assert_eq!(cycle.advance(StepResult::OutboxReady), Err(Error::State));
}

#[test]
fn refuses_sleep_after_latched_motion_that_was_not_made_durable() {
    let mut cycle = DeviceCycle::new(false);
    cycle.advance(StepResult::Done).unwrap();
    cycle.advance(StepResult::OutboxRetained).unwrap();
    assert_eq!(
        cycle.advance(StepResult::MotionHandled {
            detected: true,
            durable: false,
        }),
        Err(Error::State)
    );
    assert_eq!(cycle.stage(), Stage::ObserveMotion);
}

#[test]
fn skips_optional_work_when_not_requested_or_due() {
    let mut cycle = DeviceCycle::new(false);
    cycle.advance(StepResult::Done).unwrap();
    cycle.advance(StepResult::OutboxReady).unwrap();
    cycle
        .advance(StepResult::MotionHandled {
            detected: false,
            durable: false,
        })
        .unwrap();
    assert_eq!(
        cycle.advance(StepResult::Commands {
            locate_requested: false,
        }),
        Ok(Stage::Arm)
    );
}
