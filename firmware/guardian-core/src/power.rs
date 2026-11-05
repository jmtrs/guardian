//! Supply-current accounting for the consumption bench (P1–P5 in
//! `docs/COMPONENTES.md`).
//!
//! Pure domain: samples from any [`PowerMeter`](crate::ports::PowerMeter)
//! are folded into fixed-length windows. Each closed window yields a
//! [`Summary`] with the time-weighted mean, the extremes and the charge drawn
//! since the start. Time-weighting keeps the mean right when the sampling
//! period jitters.

use core::fmt;
use core::time::Duration;

/// One reading of a high-side current monitor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PowerSample {
    /// Current through the shunt, µA. Positive = drawn by the load.
    pub current_ua: i32,
    /// Load-side supply voltage, mV.
    pub bus_mv: u32,
}

/// Statistics of one closed window plus running totals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Summary {
    /// Time since the first sample, at the end of this window.
    pub since_start: Duration,
    /// Time-weighted mean current over the window, µA.
    pub mean_ua: i32,
    /// Lowest sample in the window, µA.
    pub min_ua: i32,
    /// Highest sample in the window, µA.
    pub max_ua: i32,
    /// Last bus voltage seen, mV.
    pub bus_mv: u32,
    /// Time-weighted mean current since the start, µA.
    pub overall_ua: i32,
    /// Charge drawn since the start, µAh.
    pub charge_uah: i64,
}

/// Accumulates samples into windows of a fixed length.
#[derive(Debug, Clone)]
pub struct PowerWindow {
    length: Duration,
    window: Accumulator,
    total: Accumulator,
}

impl PowerWindow {
    /// Windows of `length` (e.g. one second for a live readout).
    #[must_use]
    pub fn new(length: Duration) -> Self {
        Self {
            length,
            window: Accumulator::default(),
            total: Accumulator::default(),
        }
    }

    /// Add a sample that represents the last `dt` of supply current.
    /// Returns the summary when this sample closes the window.
    pub fn push(&mut self, sample: PowerSample, dt: Duration) -> Option<Summary> {
        self.window.add(sample.current_ua, dt);
        self.total.add(sample.current_ua, dt);
        if self.window.elapsed < self.length {
            return None;
        }
        let summary = Summary {
            since_start: self.total.elapsed,
            mean_ua: self.window.mean_ua(),
            min_ua: self.window.min_ua,
            max_ua: self.window.max_ua,
            bus_mv: sample.bus_mv,
            overall_ua: self.total.mean_ua(),
            charge_uah: self.total.charge_uah(),
        };
        self.window = Accumulator::default();
        Some(summary)
    }
}

/// Running integral of current over time.
#[derive(Debug, Clone, Copy)]
struct Accumulator {
    elapsed: Duration,
    /// µA·µs. i64 holds 2 A for about 50 days.
    charge: i64,
    min_ua: i32,
    max_ua: i32,
}

impl Default for Accumulator {
    fn default() -> Self {
        Self {
            elapsed: Duration::ZERO,
            charge: 0,
            min_ua: i32::MAX,
            max_ua: i32::MIN,
        }
    }
}

/// Microseconds in an hour, for µA·µs → µAh.
const US_PER_HOUR: i64 = 3_600_000_000;

impl Accumulator {
    fn add(&mut self, current_ua: i32, dt: Duration) {
        let dt_us = i64::try_from(dt.as_micros()).unwrap_or(i64::MAX);
        self.elapsed += dt;
        self.charge = self
            .charge
            .saturating_add(i64::from(current_ua).saturating_mul(dt_us));
        self.min_ua = self.min_ua.min(current_ua);
        self.max_ua = self.max_ua.max(current_ua);
    }

    fn mean_ua(&self) -> i32 {
        let elapsed_us = i64::try_from(self.elapsed.as_micros()).unwrap_or(i64::MAX);
        if elapsed_us == 0 {
            return 0;
        }
        i32::try_from(self.charge / elapsed_us).unwrap_or(i32::MAX)
    }

    fn charge_uah(&self) -> i64 {
        self.charge / US_PER_HOUR
    }
}

/// A value in thousandths printed with `decimals` digits (µA → mA, mV → V).
struct Milli {
    value: i64,
    decimals: u32,
}

impl fmt::Display for Milli {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let sign = if self.value < 0 { "-" } else { "" };
        let abs = self.value.unsigned_abs();
        let scale = 10u64.pow(3 - self.decimals);
        let text_width = f.width().unwrap_or(0);
        let mut buf = heapless_text::Text::new();
        let _ = fmt::write(
            &mut buf,
            format_args!(
                "{sign}{}.{:0w$}",
                abs / 1000,
                (abs % 1000) / scale,
                w = self.decimals as usize
            ),
        );
        write!(f, "{:>text_width$}", buf.as_str())
    }
}

fn milli(value: impl Into<i64>, decimals: u32) -> Milli {
    Milli {
        value: value.into(),
        decimals,
    }
}

impl fmt::Display for Summary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "t={:5}s  I {:8} mA  min {:8}  max {:8}  V {} V  avg {:8} mA  Q {} mAh",
            self.since_start.as_secs(),
            milli(self.mean_ua, 2),
            milli(self.min_ua, 2),
            milli(self.max_ua, 2),
            milli(self.bus_mv, 3),
            milli(self.overall_ua, 2),
            milli(self.charge_uah, 3),
        )
    }
}

/// Fixed-capacity text buffer, so padding works without an allocator.
mod heapless_text {
    use core::fmt;

    const CAPACITY: usize = 24;

    pub struct Text {
        bytes: [u8; CAPACITY],
        len: usize,
    }

    impl Text {
        pub fn new() -> Self {
            Self {
                bytes: [0; CAPACITY],
                len: 0,
            }
        }

        pub fn as_str(&self) -> &str {
            core::str::from_utf8(&self.bytes[..self.len]).unwrap_or("")
        }
    }

    impl fmt::Write for Text {
        fn write_str(&mut self, s: &str) -> fmt::Result {
            let end = self.len + s.len();
            if end > CAPACITY {
                return Err(fmt::Error);
            }
            self.bytes[self.len..end].copy_from_slice(s.as_bytes());
            self.len = end;
            Ok(())
        }
    }
}
