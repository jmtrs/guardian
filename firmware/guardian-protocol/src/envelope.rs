//! Event envelope, schema version 2.
//!
//! The body is written once into a fixed buffer and those exact bytes are
//! both signed and sent: never re-serialised. Field order and compact
//! separators match `json.dumps(..., separators=(",", ":"))` in the Python
//! reference, so signatures agree byte for byte. Every string written is
//! either a validated [`DeviceId`] or a fixed literal: nothing needs escaping.

use core::fmt::{self, Write};

use crate::identity::DeviceId;
use crate::time::UtcTime;
use crate::ProtocolError;

/// Largest body this encoder produces (a positionless event is ~200 bytes).
pub const MAX_BODY: usize = 384;
/// Largest millivolt reading the backend accepts.
pub const MAX_MILLIVOLTS: u16 = 60_000;
/// Sequences must stay below this (backend: `sequence < 2^31`).
pub const SEQUENCE_LIMIT: u32 = 1 << 31;

/// Event kinds the backend accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// Motion while parked.
    SuspectedMovement,
    /// Reserve battery low.
    BatteryLow,
    /// Vehicle supply lost.
    PowerLost,
    /// Liveness.
    Heartbeat,
    /// Position fix.
    GnssFix,
}

impl Kind {
    fn as_str(self) -> &'static str {
        match self {
            Self::SuspectedMovement => "suspected_movement",
            Self::BatteryLow => "battery_low",
            Self::PowerLost => "power_lost",
            Self::Heartbeat => "heartbeat",
            Self::GnssFix => "gnss_fix",
        }
    }
}

/// Which rail powers the device right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PowerSource {
    /// Vehicle 12 V.
    Vehicle,
    /// Internal reserve battery.
    Reserve,
    /// Firmware cannot tell.
    Unknown,
}

impl PowerSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Vehicle => "vehicle",
            Self::Reserve => "reserve",
            Self::Unknown => "unknown",
        }
    }
}

/// Power telemetry, mandatory in every event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Power {
    vehicle_mv: u16,
    reserve_mv: Option<u16>,
    source: PowerSource,
}

impl Power {
    /// Validate the readings.
    ///
    /// # Errors
    /// [`ProtocolError::Millivolts`] above [`MAX_MILLIVOLTS`].
    pub fn new(
        vehicle_mv: u16,
        reserve_mv: Option<u16>,
        source: PowerSource,
    ) -> Result<Self, ProtocolError> {
        let in_range = |mv: u16| mv <= MAX_MILLIVOLTS;
        if !in_range(vehicle_mv) || reserve_mv.is_some_and(|mv| !in_range(mv)) {
            return Err(ProtocolError::Millivolts);
        }
        Ok(Self {
            vehicle_mv,
            reserve_mv,
            source,
        })
    }
}

/// An encoded event body, ready to sign and send.
pub struct Body {
    bytes: [u8; MAX_BODY],
    len: usize,
}

impl Body {
    /// The exact bytes to sign and send.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.len]
    }
}

impl Write for Body {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        let end = self.len + s.len();
        if end > MAX_BODY {
            return Err(fmt::Error);
        }
        self.bytes[self.len..end].copy_from_slice(s.as_bytes());
        self.len = end;
        Ok(())
    }
}

/// Encode a positionless event (no `commandId`, no `position`).
///
/// # Errors
/// [`ProtocolError::Sequence`] outside `1..2^31`, [`ProtocolError::TooLong`]
/// if the body does not fit [`MAX_BODY`].
pub fn encode_event(
    device: &DeviceId,
    sequence: u32,
    kind: Kind,
    observed_at: UtcTime,
    power: Power,
) -> Result<Body, ProtocolError> {
    if sequence == 0 || sequence >= SEQUENCE_LIMIT {
        return Err(ProtocolError::Sequence);
    }
    let mut body = Body {
        bytes: [0; MAX_BODY],
        len: 0,
    };
    write!(
        body,
        "{{\"schemaVersion\":2,\"deviceId\":\"{device}\",\"sequence\":{sequence},\
         \"kind\":\"{}\",\"observedAtUtc\":\"{observed_at}\",\
         \"power\":{{\"vehicleMv\":{},\"source\":\"{}\"",
        kind.as_str(),
        power.vehicle_mv,
        power.source.as_str()
    )
    .map_err(|_| ProtocolError::TooLong)?;
    if let Some(reserve) = power.reserve_mv {
        write!(body, ",\"reserveMv\":{reserve}").map_err(|_| ProtocolError::TooLong)?;
    }
    body.write_str("}}").map_err(|_| ProtocolError::TooLong)?;
    Ok(body)
}
