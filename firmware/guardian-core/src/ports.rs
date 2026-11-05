//! Driven ports: what the core needs from hardware.
//!
//! Each trait is implemented by an adapter (ESP-IDF on the board, fakes on the
//! host). Operator output is any [`core::fmt::Write`], so no port is needed
//! for it.

use core::fmt;
use core::time::Duration;

use crate::accel::{Accel, Threshold};
use crate::error::Result;
use crate::power::PowerSample;
use guardian_protocol::time::UtcTime;

/// Cellular modem with an AT interface and GNSS.
///
/// Response and unsolicited lines are delivered by the adapter to its own line
/// sink, not through this trait.
pub trait Modem {
    /// Full power-on sequence; returns once the modem answers `AT`.
    /// Idempotent: a modem that already answers is reused, not restarted.
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

    /// Park every modem line at its "off" level and latch it so it survives
    /// deep sleep. All-or-nothing: on error the adapter has already undone any
    /// partial parking, so the modem stays usable without a reboot. Called only
    /// right before [`Platform::deep_sleep`].
    ///
    /// # Errors
    /// Any failure: sleeping then would measure P1 in an unknown state.
    fn park_for_sleep(&mut self) -> Result<()>;

    /// Let the modem sleep on its own while staying registered, and latch
    /// every line that keeps it so (supply on, sleep allowed, UART idle) to
    /// survive deep sleep. Same all-or-nothing contract as
    /// [`park_for_sleep`](Self::park_for_sleep): on error the modem is left
    /// awake and usable. Called only right before [`Platform::deep_sleep`].
    ///
    /// # Errors
    /// Any failure: sleeping then would measure P2 in an unknown state.
    fn park_in_standby(&mut self) -> Result<()>;
}

/// One signed request on the device channel.
#[derive(Debug, Clone, Copy)]
pub struct DeviceRequest<'a> {
    /// Path under the backend base URL, e.g. `/v1/events`.
    pub path: &'a str,
    /// `X-Device-Id` header.
    pub device_id: &'a str,
    /// `X-Guardian-Signature` header: HMAC of `body`, 64 hex digits.
    pub signature: &'a str,
    /// JSON body, sent exactly as signed.
    pub body: &'a [u8],
}

/// Network access through the cellular modem.
pub trait Uplink {
    /// Current UTC time, freshly synchronised from the network: a free-running
    /// modem clock can resume from a stale time after a power cycle.
    ///
    /// # Errors
    /// [`Error::State`](crate::Error::State) if no valid time is available,
    /// transport or synchronisation errors otherwise.
    fn network_time(&mut self) -> Result<UtcTime>;

    /// `POST` a signed request to the backend over HTTPS.
    ///
    /// Returns the HTTP status; any status is a successful exchange, judging
    /// it is the caller's job.
    ///
    /// # Errors
    /// [`Error::Timeout`](crate::Error::Timeout) or [`Error::Rejected`](crate::Error::Rejected) if no
    /// HTTP status was obtained (no data bearer, TLS or DNS failure).
    fn post(&mut self, request: &DeviceRequest<'_>) -> Result<u16>;
}

/// Identity of a detected sensor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SensorInfo {
    /// 7-bit bus address it answered on.
    pub address: u8,
    /// Value of its identification register.
    pub chip_id: u8,
}

/// Interrupt latch contents, read while clearing it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Latch {
    /// An interrupt was latched. The raw source also carries live per-axis
    /// flags, so a non-zero source alone does not mean motion.
    pub active: bool,
    /// Raw source register, for diagnostics.
    pub raw: u8,
}

impl fmt::Display for Latch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:#04x}", self.raw)
    }
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

    /// Clear the latch and report what it held.
    ///
    /// # Errors
    /// Bus errors: the latch is then still set.
    fn acknowledge(&mut self) -> Result<Latch>;

    /// Diagnostics for a failed [`probe`](Self::probe): call `found` with
    /// every bus address that answers and the byte its identification
    /// register returns. No calls means nothing answers at all (wiring,
    /// power or bus-mode problem); a call with a foreign id means another
    /// chip, or a sensor at an unexpected address.
    fn scan(&mut self, found: &mut dyn FnMut(u8, u8));
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

    /// Configure the motion line as deep-sleep wake source. Harmless if the
    /// sleep is then aborted: it only takes effect when sleeping.
    ///
    /// # Errors
    /// If the wake source cannot be armed: sleeping would never wake on motion.
    fn arm_motion_wake(&mut self) -> Result<()>;

    /// Last event sequence durably recorded, `None` on a device that never
    /// sent one.
    ///
    /// # Errors
    /// Storage unreadable: sending then could reuse a sequence.
    fn last_sequence(&mut self) -> Result<Option<u32>>;

    /// Durably record `sequence` as used. Called before the event leaves, so
    /// a crash after sending can only skip a value, never repeat it.
    ///
    /// # Errors
    /// Storage write failure: the event must not be sent.
    fn store_sequence(&mut self, sequence: u32) -> Result<()>;

    /// Durably store the device identity (factory provisioning) and forget
    /// the sequence of any previous identity. The secret is already
    /// validated; adapters must never log it.
    ///
    /// # Errors
    /// Storage write failure.
    fn store_identity(&mut self, device_id: &str, root_secret_hex: &str) -> Result<()>;

    /// Enter deep sleep, keeping latched pads. Requires
    /// [`arm_motion_wake`](Self::arm_motion_wake) first.
    ///
    /// Does not return on hardware; fakes return so tests can observe it.
    fn deep_sleep(&mut self);
}

/// High-side current monitor in series with a supply (power bench).
pub trait PowerMeter {
    /// Detect and configure the monitor. Idempotent.
    ///
    /// # Errors
    /// [`Error::NotFound`](crate::Error::NotFound) if absent or not the
    /// expected chip, bus errors otherwise.
    fn probe(&mut self) -> Result<()>;

    /// Latest conversion.
    ///
    /// # Errors
    /// [`Error::State`](crate::Error::State) before a successful probe,
    /// [`Error::Rejected`](crate::Error::Rejected) if the current exceeded
    /// the measurement range, bus errors otherwise.
    fn sample(&mut self) -> Result<PowerSample>;
}
