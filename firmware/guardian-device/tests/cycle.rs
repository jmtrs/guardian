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
        (StepResult::Done, Stage::HeartbeatIfDue),
        (StepResult::Done, Stage::Arm),
        (StepResult::Done, Stage::Sleep),
        (StepResult::Done, Stage::Complete),
    ];
    for (result, expected) in transitions {
        assert_eq!(cycle.advance(result), Ok(expected));
    }
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
