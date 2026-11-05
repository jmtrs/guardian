//! Production-only hardware boundaries. Bench adapters stay in `bringup`;
//! the production composition root must implement these explicitly.

use guardian_core::error::Result;
use guardian_protocol::envelope::{Position, Power};
use guardian_protocol::time::UtcTime;

use crate::outbox::PendingEvent;

/// Durable device state. Implementations must commit each mutation before
/// returning success.
pub trait EventStore {
    /// Read the one in-flight event, if any.
    ///
    /// # Errors
    /// Durable storage is unreadable or fails integrity checks.
    fn load_pending(&mut self) -> Result<Option<PendingEvent>>;

    /// Store exact bytes and sequence before any network attempt.
    ///
    /// # Errors
    /// Durable storage could not commit the complete record.
    fn save_pending(&mut self, event: &PendingEvent) -> Result<()>;

    /// Last sequence that reached a terminal backend response.
    ///
    /// # Errors
    /// Durable storage is unreadable or fails integrity checks.
    fn last_sequence(&mut self) -> Result<Option<u32>>;

    /// Commit a terminal sequence before clearing its bytes.
    ///
    /// # Errors
    /// Durable storage could not commit the sequence.
    fn commit_sequence(&mut self, sequence: u32) -> Result<()>;

    /// Clear the in-flight event after its sequence is committed.
    ///
    /// # Errors
    /// Durable storage could not clear the record.
    fn clear_pending(&mut self) -> Result<()>;

    /// Durably coalesce a motion observation while the outbox slot is full.
    /// The next free sequence must represent this deferred observation before
    /// ordinary producers run.
    ///
    /// # Errors
    /// Durable storage could not commit the generation.
    fn defer_motion(&mut self) -> Result<u32>;

    /// Generation of the newest coalesced motion that still needs an event.
    ///
    /// # Errors
    /// Durable storage is unreadable or fails integrity checks.
    fn deferred_motion_generation(&mut self) -> Result<Option<u32>>;

    /// Consume `generation` only after its marked event obtained a terminal
    /// backend receipt. A newer generation must remain deferred. The pending
    /// record is cleared afterwards.
    ///
    /// # Errors
    /// Durable storage could not reconcile the generation.
    fn clear_deferred_motion(&mut self, generation: u32) -> Result<()>;
}

/// Event transport. It must sign and send `body` without re-serialising it.
pub trait EventUplink {
    /// Return the backend HTTP status, or a transport error if none arrived.
    ///
    /// # Errors
    /// No authenticated HTTP response was obtained.
    fn post_event(&mut self, body: &[u8]) -> Result<u16>;
}

/// Trusted clock and heartbeat schedule.
pub trait Clock {
    /// Current UTC time.
    ///
    /// # Errors
    /// No trusted time source is available.
    fn now(&mut self) -> Result<UtcTime>;

    /// Whether this wake must emit a heartbeat.
    ///
    /// # Errors
    /// The persisted heartbeat schedule is unreadable.
    fn heartbeat_due(&mut self, now: UtcTime) -> Result<bool>;
}

/// Vehicle and reserve rail telemetry.
pub trait PowerSampler {
    /// Read one validated protocol sample.
    ///
    /// # Errors
    /// A rail could not be sampled or produced invalid telemetry.
    fn sample_power(&mut self) -> Result<Power>;
}

/// GNSS acquisition boundary.
pub trait Positioner {
    /// Acquire a fix, or report that no fix was obtained within the bound.
    ///
    /// # Errors
    /// GNSS transport or hardware failed before a bounded no-fix result.
    fn locate(&mut self) -> Result<Option<Position>>;
}

/// Authenticated backend command channel.
pub trait CommandChannel {
    /// Poll commands and return whether a live `LOCATE_NOW` is pending.
    ///
    /// # Errors
    /// The authenticated command request obtained no valid response.
    fn locate_requested(&mut self, now: UtcTime) -> Result<bool>;
}

/// Wake-source programming and final deep sleep.
pub trait WakeTimer {
    /// Arm the next periodic wake in addition to motion wake.
    ///
    /// # Errors
    /// Either wake source could not be armed.
    fn arm_after(&mut self, seconds: u32) -> Result<()>;

    /// Enter deep sleep; hardware implementations do not return.
    ///
    /// # Errors
    /// Platform refused to enter sleep safely.
    fn sleep(&mut self) -> Result<()>;
}
