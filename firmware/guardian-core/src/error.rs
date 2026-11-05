//! Error type shared by every port and use case.

use core::fmt;

/// Why a port operation or use case step failed.
///
/// Adapters translate their native errors (ESP-IDF `EspError`, I²C bus
/// errors, ...) into this type at the port boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// Peripheral absent or it did not identify itself as expected.
    NotFound,
    /// Peripheral did not answer in time.
    Timeout,
    /// Peripheral answered with an explicit error (e.g. AT `ERROR`).
    Rejected,
    /// Bus or transport failure.
    Io,
    /// Operation not valid in the current state.
    State,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NotFound => "not found",
            Self::Timeout => "timeout",
            Self::Rejected => "rejected",
            Self::Io => "i/o error",
            Self::State => "invalid state",
        })
    }
}

impl core::error::Error for Error {}

/// Result alias used across the crate.
pub type Result<T> = core::result::Result<T, Error>;
