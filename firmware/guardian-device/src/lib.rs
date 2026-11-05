//! Production-domain firmware, deliberately separate from the interactive
//! `bringup` binary.
//!
//! The first vertical slice contains two power-loss-safe invariants:
//!
//! - [`outbox`] persists the exact encoded bytes before network I/O and keeps
//!   resending them until the backend returns `202` or `409`.
//! - [`cycle`] makes wake processing order explicit and prevents later work
//!   while an outbox item is still undelivered.
//!
//! ESP-IDF adapters implement [`ports`] in the target binary; all rules here
//! are `no_std`, allocation-free, and host tested.
#![no_std]
#![forbid(unsafe_code)]

pub mod cycle;
pub mod motion;
pub mod outbox;
pub mod ports;
pub mod record;
pub mod storage;
pub mod uplink;
