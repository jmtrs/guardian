//! Driven ports: what the core needs from hardware.
//!
//! Each trait is implemented by an adapter (ESP-IDF on the board, fakes on the
//! host). Operator output is any [`core::fmt::Write`], so no port is needed
//! for it.

use core::time::Duration;

use crate::accel::{Accel, Threshold};
use crate::error::Result;

/// Cellular modem with an AT interface and GNSS.
///
/// Response and unsolicited lines are delivered by the adapter to its own line
/// sink, not through this trait.
pub trait Modem {
    /// Full power-on sequence; returns once the modem answers `AT`.
    ///
    /// # Errors
    /// [`Error::Timeout`](crate::Error::Timeout) if it never answers.
    fn power_on(&mut self) -> Result<()>;

    /// Power off and cut the supply rail. Safe if already off.
    fn power_off(&mut self);

    /// Send a command and wait for its final result code.
    ///
    /// # Errors
    /// [`Error::Rejected`](crate::Error::Rejected) on `ERROR`/`+CME ERROR`,
    /// [`Error::Timeout`](crate::Error::Timeout) if no result arrives.
    fn command(&mut self, cmd: &str, timeout: Duration) -> Result<()>;

    /// Send a raw line (CRLF appended) without waiting for a result.
    fn send_raw(&mut self, line: &str);

    /// Latch every modem line in its "off" level so it survives deep sleep.
    ///
    /// # Errors
    /// Any failure: sleeping then would measure P1 in an unknown state.
    fn hold_off_during_sleep(&mut self) -> Result<()>;
}

/// Identity of a detected sensor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SensorInfo {
    /// 7-bit bus address it answered on.
    pub address: u8,
    /// Value of its identification register.
    pub chip_id: u8,
}

/// Accelerometer with a latched motion interrupt.
pub trait MotionSensor {
    /// Detect and initialise the sensor. Idempotent.
    ///
    /// # Errors
    /// [`Error::NotFound`](crate::Error::NotFound) if absent or wrong chip.
    fn probe(&mut self) -> Result<SensorInfo>;

    /// Read one sample.
    ///
    /// # Errors
    /// [`Error::State`](crate::Error::State) before a successful probe, or bus errors.
    fn read(&mut self) -> Result<Accel>;

    /// Configure the latched motion interrupt.
    ///
    /// # Errors
    /// Bus errors, or [`Error::State`](crate::Error::State) before probe.
    fn arm(&mut self, threshold: Threshold) -> Result<()>;

    /// Current level of the interrupt line (`true` = motion latched).
    fn is_triggered(&mut self) -> bool;

    /// Clear the latch; returns the raw interrupt source, for diagnostics.
    ///
    /// # Errors
    /// Bus errors: the latch is then still set.
    fn acknowledge(&mut self) -> Result<u8>;
}

/// Why the MCU is running.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WakeCause {
    /// Cold boot or reset.
    PowerOn,
    /// Woken from deep sleep by the motion interrupt.
    Motion,
    /// Any other wake source.
    Other,
}

/// Static identity of the board, for bring-up records.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Identity {
    /// Chip revision, `major * 100 + minor`.
    pub chip_revision: u16,
    /// CPU cores.
    pub cores: u8,
    /// Detected flash size.
    pub flash_bytes: u32,
    /// Usable PSRAM, 0 if absent.
    pub psram_bytes: u32,
    /// Base MAC address.
    pub mac: [u8; 6],
}

/// MCU services.
pub trait Platform {
    /// Block the calling task.
    fn delay(&mut self, duration: Duration);

    /// Chip, memory and MAC data.
    fn identity(&mut self) -> Identity;

    /// Battery rail in mV, `None` if it cannot be measured.
    fn battery_mv(&mut self) -> Option<u32>;

    /// Reason for the current boot.
    fn wake_cause(&mut self) -> WakeCause;

    /// Enter deep sleep with the motion line as wake source.
    ///
    /// Does not return on hardware; fakes return so tests can observe it.
    fn deep_sleep_until_motion(&mut self);
}
