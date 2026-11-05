//! Stable NVS names and motion-state codec shared by production and the
//! bring-up compatibility gate.

use guardian_core::error::{Error, Result};

const MOTION_DEFERRED_BIT: u64 = 1;

/// Guardian NVS namespace.
pub const NVS_NAMESPACE: &str = "guardian";
/// One checksummed pending-event blob.
pub const NVS_PENDING_KEY: &str = "pending";
/// Last terminal event sequence.
pub const NVS_SEQUENCE_KEY: &str = "seq";
/// Monotonic motion generation plus its deferred/consumed bit.
pub const NVS_MOTION_KEY: &str = "motion";
/// Provisioned device id.
pub const NVS_DEVICE_ID_KEY: &str = "device_id";
/// Provisioned root secret.
pub const NVS_ROOT_SECRET_KEY: &str = "root_secret";

/// Advance the monotonic motion watermark and mark the new generation deferred.
///
/// The encoded state is never reset when a generation is consumed, so a reboot
/// cannot reuse a generation while an older pending event still exists.
///
/// # Errors
/// [`Error::State`] when persisted state is invalid or the counter is exhausted.
pub fn advance_motion_state(state: Option<u64>) -> Result<(u64, u32)> {
    let current = match state {
        Some(raw) => decode_motion_state(raw)?.0,
        None => 0,
    };
    let generation = current.checked_add(1).ok_or(Error::State)?;
    Ok((encode_motion_state(generation, true), generation))
}

/// Return the deferred generation, retaining a consumed generation as an
/// invisible monotonic watermark.
///
/// # Errors
/// [`Error::State`] when persisted state is invalid.
pub fn deferred_motion_generation(state: Option<u64>) -> Result<Option<u32>> {
    let Some(raw) = state else {
        return Ok(None);
    };
    let (generation, deferred) = decode_motion_state(raw)?;
    Ok(deferred.then_some(generation))
}

/// Consume `generation` without erasing the monotonic watermark. If a newer
/// generation exists, its encoded state is returned unchanged.
///
/// # Errors
/// [`Error::State`] for zero, missing/corrupt state, or a future generation.
pub fn consume_motion_generation(state: Option<u64>, generation: u32) -> Result<u64> {
    if generation == 0 {
        return Err(Error::State);
    }
    let raw = state.ok_or(Error::State)?;
    let (current, deferred) = decode_motion_state(raw)?;
    if current < generation {
        return Err(Error::State);
    }
    if current > generation || !deferred {
        return Ok(raw);
    }
    Ok(encode_motion_state(current, false))
}

fn encode_motion_state(generation: u32, deferred: bool) -> u64 {
    (u64::from(generation) << 1) | u64::from(deferred)
}

fn decode_motion_state(raw: u64) -> Result<(u32, bool)> {
    let generation = raw >> 1;
    if generation == 0 || generation > u64::from(u32::MAX) {
        return Err(Error::State);
    }
    Ok((
        u32::try_from(generation).map_err(|_| Error::State)?,
        raw & MOTION_DEFERRED_BIT != 0,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consumed_state_retains_monotonic_watermark() {
        let (first_state, first) = advance_motion_state(None).unwrap();
        let consumed = consume_motion_generation(Some(first_state), first).unwrap();
        assert_eq!(deferred_motion_generation(Some(consumed)), Ok(None));

        let (second_state, second) = advance_motion_state(Some(consumed)).unwrap();
        assert_eq!(second, first + 1);
        assert_eq!(
            deferred_motion_generation(Some(second_state)),
            Ok(Some(second))
        );
        assert_eq!(
            consume_motion_generation(Some(second_state), first),
            Ok(second_state)
        );
    }

    #[test]
    fn rejects_invalid_or_future_generations() {
        assert_eq!(deferred_motion_generation(Some(0)), Err(Error::State));
        assert_eq!(consume_motion_generation(None, 1), Err(Error::State));
        let (state, _) = advance_motion_state(None).unwrap();
        assert_eq!(consume_motion_generation(Some(state), 2), Err(Error::State));
    }
}
