//! Deterministic production wake cycle.

use guardian_core::error::{Error, Result};

/// Current phase. Hardware code performs it, then reports a [`StepResult`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    /// Initialise after boot or wake.
    BootOrWake,
    /// Retry durable bytes before producing anything newer.
    DrainOutbox,
    /// Read and clear the latched motion source.
    ObserveMotion,
    /// Poll the authenticated command channel.
    PollCommands,
    /// Acquire the requested GNSS fix.
    OptionalLocate,
    /// Emit periodic liveness when due.
    HeartbeatIfDue,
    /// Arm motion and timer wake sources.
    Arm,
    /// Enter deep sleep.
    Sleep,
    /// One wake cycle completed.
    Complete,
}

/// Result accepted by [`DeviceCycle::advance`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepResult {
    /// Ordinary phase completed.
    Done,
    /// No event remains in the outbox.
    OutboxReady,
    /// An event remains; skip producers and return to sleep for a later retry.
    OutboxRetained,
    /// The current producer persisted a new event in the one-slot outbox.
    EventStaged,
    /// Motion latch was read and cleared. If motion was detected, `durable`
    /// confirms it was staged when the slot was free, or durably coalesced when
    /// an older event still occupied the slot.
    MotionHandled {
        /// The hardware motion source was active.
        detected: bool,
        /// The observation is now durable.
        durable: bool,
    },
    /// Command poll completed with or without `LOCATE_NOW`.
    Commands {
        /// A live `LOCATE_NOW` was returned.
        locate_requested: bool,
    },
}

/// State machine for one boot/wake pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeviceCycle {
    stage: Stage,
    heartbeat_due: bool,
    outbox_blocked: bool,
    resume_after_drain: Option<Stage>,
}

impl DeviceCycle {
    /// Start a cycle with the already-computed heartbeat deadline.
    #[must_use]
    pub const fn new(heartbeat_due: bool) -> Self {
        Self {
            stage: Stage::BootOrWake,
            heartbeat_due,
            outbox_blocked: false,
            resume_after_drain: None,
        }
    }

    /// Phase hardware must perform next.
    #[must_use]
    pub const fn stage(self) -> Stage {
        self.stage
    }

    /// Advance only when the result matches the current phase.
    ///
    /// An undelivered outbox item still passes through [`Stage::ObserveMotion`]
    /// so a latched interrupt is cleared. Any detected motion must first be
    /// durably coalesced; all later producers remain blocked for this cycle.
    ///
    /// # Errors
    /// [`Error::State`] for an out-of-order or mismatched result.
    pub fn advance(&mut self, result: StepResult) -> Result<Stage> {
        self.stage = match (self.stage, result) {
            (Stage::BootOrWake, StepResult::Done) => Stage::DrainOutbox,
            (Stage::DrainOutbox, StepResult::OutboxRetained) => {
                if self.resume_after_drain.take().is_some() {
                    Stage::Arm
                } else {
                    self.outbox_blocked = true;
                    Stage::ObserveMotion
                }
            }
            (Stage::DrainOutbox, StepResult::OutboxReady) => self
                .resume_after_drain
                .take()
                .unwrap_or(Stage::ObserveMotion),
            (Stage::ObserveMotion, StepResult::MotionHandled { detected, durable })
                if !detected || durable =>
            {
                if self.outbox_blocked {
                    Stage::Arm
                } else if detected {
                    self.resume_after_drain = Some(Stage::PollCommands);
                    Stage::DrainOutbox
                } else {
                    Stage::PollCommands
                }
            }
            (
                Stage::PollCommands,
                StepResult::Commands {
                    locate_requested: true,
                },
            ) => Stage::OptionalLocate,
            (
                Stage::PollCommands,
                StepResult::Commands {
                    locate_requested: false,
                },
            )
            | (Stage::OptionalLocate, StepResult::Done) => self.after_optional_work(),
            (Stage::OptionalLocate, StepResult::EventStaged) => {
                self.resume_after_drain = Some(self.after_optional_work());
                Stage::DrainOutbox
            }
            (Stage::HeartbeatIfDue, StepResult::EventStaged) => {
                self.resume_after_drain = Some(Stage::Arm);
                Stage::DrainOutbox
            }
            (Stage::Arm, StepResult::Done) => Stage::Sleep,
            (Stage::Sleep, StepResult::Done) => Stage::Complete,
            _ => return Err(Error::State),
        };
        Ok(self.stage)
    }

    const fn after_optional_work(self) -> Stage {
        if self.heartbeat_due {
            Stage::HeartbeatIfDue
        } else {
            Stage::Arm
        }
    }
}
