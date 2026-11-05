//! Wiring check for the motion-sensor bus, run before the I²C driver takes
//! the pads.
//!
//! Sensor breakouts pull SDA and SCL up to their own supply. Reading both
//! lines against the ESP32's weak internal pull-down tells whether a wire
//! reaches a powered breakout: a connected line with a pull-up reads high, an
//! open one reads low. A breakout without pull-ups also reads low, so "low"
//! alone does not prove a broken wire.

use std::fmt;

use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::gpio::{Gpio21, Gpio22, PinDriver, Pull};
use esp_idf_svc::sys::EspError;

/// Settling time for the pull-down before sampling.
const SETTLE_MS: u32 = 2;

/// Idle levels of the I²C lines with the internal pull-downs enabled.
#[derive(Debug, Clone, Copy)]
pub struct BusLevels {
    /// SDA (IO21) read high.
    pub sda: bool,
    /// SCL (IO22) read high.
    pub scl: bool,
}

impl BusLevels {
    /// Sample SDA and SCL, then give the pads back unconfigured.
    ///
    /// # Errors
    /// If ESP-IDF rejects the temporary input configuration.
    pub fn sample(sda: &mut Gpio21<'static>, scl: &mut Gpio22<'static>) -> Result<Self, EspError> {
        // SAFETY: the reborrowed pins only feed the two temporary drivers
        // below, which are dropped (never forgotten) when this function
        // returns. Dropping resets the pads, so the I²C driver later receives
        // them in their default state.
        let (sda, scl) = unsafe { (sda.reborrow(), scl.reborrow()) };
        let sda = PinDriver::input(sda, Pull::Down)?;
        let scl = PinDriver::input(scl, Pull::Down)?;
        FreeRtos::delay_ms(SETTLE_MS);
        Ok(Self {
            sda: sda.is_high(),
            scl: scl.is_high(),
        })
    }
}

impl fmt::Display for BusLevels {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let level = |high: bool| if high { "high" } else { "low" };
        write!(
            f,
            "I2C idle levels with pull-down: SDA(IO21) {}, SCL(IO22) {} -> ",
            level(self.sda),
            level(self.scl)
        )?;
        f.write_str(match (self.sda, self.scl) {
            (true, true) => "breakout powered and both wires connected",
            (false, false) => {
                "no pull-up seen: check VCC/GND and both wires (or breakout has none)"
            }
            (true, false) => "SCL wire (IO22) not reaching the breakout",
            (false, true) => "SDA wire (IO21) not reaching the breakout",
        })
    }
}
