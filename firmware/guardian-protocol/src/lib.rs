//! # guardian-protocol
//!
//! Device → backend contract, schema version 2, for the firmware. The
//! executable reference is `guardian/protocol.py`, already accepted by the
//! backend (`backend/src/devices/protocol.ts`); this crate reproduces it byte
//! for byte, and the tests pin vectors produced by that reference.
//!
//! - [`identity`]: device id, root secret, per-context keys (HKDF-SHA256),
//!   HMAC-SHA256 signature.
//! - [`time`]: UTC timestamps without a clock library.
//! - [`envelope`]: the signed event body.
//!
//! `no_std`, no allocator, no `unsafe`. Crypto comes from `RustCrypto`
//! (`hkdf`, `hmac`, `sha2`); nothing cryptographic is hand-written here.
#![no_std]

pub mod envelope;
pub mod identity;
pub mod time;

use core::fmt;

/// Why a protocol value could not be built.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolError {
    /// Device id empty, too long, or with characters outside `[A-Za-z0-9_-]`.
    DeviceId,
    /// Root secret is not 64 hex digits.
    Secret,
    /// Calendar fields out of range, or before 1970.
    Time,
    /// Sequence outside `1..2^31`, the backend's accepted range.
    Sequence,
    /// A millivolt reading above 60000, the backend's limit.
    Millivolts,
    /// Encoded body larger than [`envelope::MAX_BODY`].
    TooLong,
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::DeviceId => "invalid device id",
            Self::Secret => "invalid root secret",
            Self::Time => "invalid time",
            Self::Sequence => "sequence out of range",
            Self::Millivolts => "millivolts out of range",
            Self::TooLong => "body too long",
        })
    }
}

impl core::error::Error for ProtocolError {}
