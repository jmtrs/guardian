//! One-slot, power-loss-safe event outbox.

use guardian_core::error::{Error, Result};
use guardian_protocol::envelope::{Body, MAX_BODY, SEQUENCE_LIMIT};

use crate::ports::{EventStore, EventUplink};

/// Exact encoded event restored from or ready for durable storage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingEvent {
    bytes: [u8; MAX_BODY],
    len: usize,
    sequence: u32,
    motion_generation: Option<u32>,
}

impl PendingEvent {
    /// Copy a freshly encoded body into the durable record shape.
    #[must_use]
    pub fn from_body(body: &Body) -> Self {
        Self::from_body_with_motion(body, None)
    }

    /// Copy a movement body that satisfies one durable motion generation.
    ///
    /// # Errors
    /// [`Error::State`] for generation zero.
    pub fn from_deferred_motion(body: &Body, generation: u32) -> Result<Self> {
        if generation == 0 {
            return Err(Error::State);
        }
        Ok(Self::from_body_with_motion(body, Some(generation)))
    }

    fn from_body_with_motion(body: &Body, motion_generation: Option<u32>) -> Self {
        let mut bytes = [0; MAX_BODY];
        bytes[..body.as_bytes().len()].copy_from_slice(body.as_bytes());
        Self {
            bytes,
            len: body.as_bytes().len(),
            sequence: body.sequence(),
            motion_generation,
        }
    }

    /// Restore bytes read from durable storage.
    ///
    /// The adapter must verify its own record checksum before calling this.
    ///
    /// # Errors
    /// [`Error::State`] for an empty/oversized body or invalid sequence.
    pub fn restore(sequence: u32, body: &[u8]) -> Result<Self> {
        Self::restore_with_motion(sequence, body, None)
    }

    /// Restore a record that also satisfies deferred motion.
    ///
    /// # Errors
    /// The same validation failures as [`restore`](Self::restore).
    pub fn restore_deferred_motion(sequence: u32, body: &[u8], generation: u32) -> Result<Self> {
        if generation == 0 {
            return Err(Error::State);
        }
        Self::restore_with_motion(sequence, body, Some(generation))
    }

    fn restore_with_motion(
        sequence: u32,
        body: &[u8],
        motion_generation: Option<u32>,
    ) -> Result<Self> {
        if sequence == 0 || sequence >= SEQUENCE_LIMIT || body.is_empty() || body.len() > MAX_BODY {
            return Err(Error::State);
        }
        let mut bytes = [0; MAX_BODY];
        bytes[..body.len()].copy_from_slice(body);
        Ok(Self {
            bytes,
            len: body.len(),
            sequence,
            motion_generation,
        })
    }

    /// Exact bytes to sign and transmit.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.len]
    }

    /// Sequence contained in the record.
    #[must_use]
    pub const fn sequence(&self) -> u32 {
        self.sequence
    }

    /// Motion generation this record satisfies on terminal delivery.
    #[must_use]
    pub const fn deferred_motion_generation(&self) -> Option<u32> {
        self.motion_generation
    }
}

/// Why a terminal response allowed the outbox slot to clear.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Receipt {
    /// Backend stored the event now (`202`).
    Accepted,
    /// Backend already had this sequence (`409`), normally after a lost `202`.
    AlreadyRecorded,
}

/// Result of one drain attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DrainOutcome {
    /// No event was pending.
    Empty,
    /// Exact bytes remain persisted for the next attempt.
    Retained,
    /// Sequence committed and slot cleared.
    Delivered {
        /// Sequence now durably committed.
        sequence: u32,
        /// Terminal backend response.
        receipt: Receipt,
    },
}

/// Persist a new encoded body before it may leave the device.
///
/// # Errors
/// [`Error::State`] if a prior event is pending or the sequence does not
/// advance, plus storage errors from the adapter.
pub fn stage<S: EventStore>(store: &mut S, body: &Body) -> Result<PendingEvent> {
    stage_event(store, body, None)
}

/// Persist a movement event that consumes its deferred-motion generation only
/// after terminal delivery.
///
/// # Errors
/// The same storage and sequence failures as [`stage`].
pub fn stage_deferred_motion<S: EventStore>(
    store: &mut S,
    body: &Body,
    generation: u32,
) -> Result<PendingEvent> {
    stage_event(store, body, Some(generation))
}

fn stage_event<S: EventStore>(
    store: &mut S,
    body: &Body,
    motion_generation: Option<u32>,
) -> Result<PendingEvent> {
    if store.load_pending()?.is_some()
        || store
            .last_sequence()?
            .is_some_and(|last| body.sequence() <= last)
    {
        return Err(Error::State);
    }
    let event = if let Some(generation) = motion_generation {
        PendingEvent::from_deferred_motion(body, generation)?
    } else {
        PendingEvent::from_body(body)
    };
    store.save_pending(&event)?;
    Ok(event)
}

/// Try the exact persisted bytes once. Transport errors and non-terminal HTTP
/// statuses retain them; storage failures are returned fail-closed.
///
/// # Errors
/// Storage failures while loading/committing/clearing the record.
pub fn drain<S: EventStore, U: EventUplink>(store: &mut S, uplink: &mut U) -> Result<DrainOutcome> {
    let Some(event) = store.load_pending()? else {
        return Ok(DrainOutcome::Empty);
    };
    let Ok(status) = uplink.post_event(event.as_bytes()) else {
        return Ok(DrainOutcome::Retained);
    };
    let receipt = match status {
        202 => Receipt::Accepted,
        409 => Receipt::AlreadyRecorded,
        _ => return Ok(DrainOutcome::Retained),
    };
    store.commit_sequence(event.sequence())?;
    if let Some(generation) = event.deferred_motion_generation() {
        store.clear_deferred_motion(generation)?;
    }
    store.clear_pending()?;
    Ok(DrainOutcome::Delivered {
        sequence: event.sequence(),
        receipt,
    })
}
