//! Durable production handling for one motion observation.

use guardian_core::accel::Threshold;
use guardian_core::error::{Error, Result};
use guardian_core::ports::MotionSensor;
use guardian_protocol::envelope::{encode_event, Kind, SEQUENCE_LIMIT};
use guardian_protocol::identity::DeviceId;

use crate::outbox::stage_deferred_motion;
use crate::ports::{Clock, EventStore, PowerSampler};

/// Result of reconciling the hardware latch and durable deferred motion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MotionObservation {
    /// This cycle observed or recovered a pending movement.
    pub detected: bool,
    /// A new movement event was persisted in the outbox.
    pub event_staged: bool,
}

/// Make motion durable before clearing its hardware latch, then stage it when
/// the one-slot outbox is free.
///
/// `woke_by_motion` is supplied by the platform wake cause. A high interrupt
/// line is also treated as motion, including on a cold boot. A previously
/// deferred observation is recovered even when neither signal is present now.
///
/// # Errors
/// Sensor, storage, time, telemetry or encoding failures. A deferred generation
/// is retained until its marked outbox event receives a terminal response.
pub fn observe_motion<S, M, C, P>(
    device: &DeviceId,
    woke_by_motion: bool,
    store: &mut S,
    sensor: &mut M,
    clock: &mut C,
    power: &mut P,
) -> Result<MotionObservation>
where
    S: EventStore,
    M: MotionSensor,
    C: Clock,
    P: PowerSampler,
{
    let line_high = sensor.is_triggered();
    if woke_by_motion || line_high {
        store.defer_motion()?;
    }
    sensor.probe()?;
    if line_high {
        sensor.acknowledge()?;
    }

    let Some(generation) = store.deferred_motion_generation()? else {
        return Ok(MotionObservation {
            detected: false,
            event_staged: false,
        });
    };
    if store.load_pending()?.is_some() {
        return Ok(MotionObservation {
            detected: true,
            event_staged: false,
        });
    }

    let now = clock.now()?;
    let sequence = next_sequence(store.last_sequence()?)?;
    let sample = power.sample_power()?;
    let body = encode_event(device, sequence, Kind::SuspectedMovement, now, sample)
        .map_err(|_| Error::State)?;
    stage_deferred_motion(store, &body, generation)?;
    Ok(MotionObservation {
        detected: true,
        event_staged: true,
    })
}

/// Arm the sensor at the start of an active cycle without letting continuous
/// motion block networking.
///
/// A high line is made durable before its latch is acknowledged. Unlike
/// [`arm_for_sleep`], a line that relatches during `settle` is deliberately
/// left for [`observe_motion`] to reconcile; entering deep sleep is not the
/// next action, so there is no wake-loop risk.
/// Returns `true` when a latch was captured during preparation.
///
/// # Errors
/// Sensor or durable-storage failures.
pub fn prepare_for_active_cycle<S, M, F>(
    store: &mut S,
    sensor: &mut M,
    threshold: Threshold,
    settle: F,
) -> Result<bool>
where
    S: EventStore,
    M: MotionSensor,
    F: FnOnce(),
{
    sensor.probe()?;
    sensor.arm(threshold)?;
    if sensor.is_triggered() {
        store.defer_motion()?;
        sensor.acknowledge()?;
        settle();
        return Ok(true);
    }
    Ok(false)
}

/// Arm the sensor for deep sleep without losing motion that races the setup.
///
/// If the line is high after arming, a deferred generation is committed before
/// the latch is acknowledged. `settle` lets the hardware line fall before it
/// is checked again; a re-latched/stuck line fails closed instead of entering
/// an immediate wake loop.
/// Returns `true` when motion was captured during arming.
///
/// # Errors
/// Sensor or storage failures, or [`Error::State`] if the line remains high.
pub fn arm_for_sleep<S, M, F>(
    store: &mut S,
    sensor: &mut M,
    threshold: Threshold,
    settle: F,
) -> Result<bool>
where
    S: EventStore,
    M: MotionSensor,
    F: FnOnce(),
{
    sensor.probe()?;
    sensor.arm(threshold)?;
    capture_latched_motion(store, sensor, settle)
}

/// Persist and clear motion already latched while preparing for sleep.
///
/// Call this again immediately before deep sleep to close races introduced by
/// slower shutdown work between initial arming and sleep entry.
/// Returns `true` when a latch was made durable and cleared.
///
/// # Errors
/// Storage or sensor failures, or [`Error::State`] if the line stays high.
pub fn capture_latched_motion<S, M, F>(store: &mut S, sensor: &mut M, settle: F) -> Result<bool>
where
    S: EventStore,
    M: MotionSensor,
    F: FnOnce(),
{
    if sensor.is_triggered() {
        store.defer_motion()?;
        sensor.acknowledge()?;
        settle();
        if sensor.is_triggered() {
            return Err(Error::State);
        }
        return Ok(true);
    }
    Ok(false)
}

/// Pick the next monotonic sequence. A new device starts at one; wall-clock
/// input must never control the anti-replay counter.
///
/// # Errors
/// [`Error::State`] when the range is exhausted.
pub fn next_sequence(last: Option<u32>) -> Result<u32> {
    let next = match last {
        Some(last) => last.checked_add(1),
        None => Some(1),
    };
    next.filter(|sequence| *sequence > 0 && *sequence < SEQUENCE_LIMIT)
        .ok_or(Error::State)
}
