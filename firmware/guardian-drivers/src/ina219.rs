//! TI INA219 high-side current/voltage monitor over I²C (power bench).
//!
//! Reads the raw shunt-voltage register and divides by the shunt resistance
//! itself, so the calibration register is not needed. The shunt LSB is fixed
//! at 10 µV: 0.1 mA with the 0.1 Ω shunt of common breakouts.
//!
//! Configuration (datasheet `SBOS448G`, §8.6.2.1): ±320 mV shunt range
//! (±3.2 A at 0.1 Ω, enough for LTE bursts), 16 V bus range, shunt averaged
//! over 128 conversions (68 ms, smooths the modem's TX pulses), bus 12-bit,
//! both converted continuously.

use embedded_hal::i2c::I2c;
use guardian_core::ports::PowerMeter;
use guardian_core::power::PowerSample;
use guardian_core::Error;

/// Address with A0 and A1 to GND (breakout default).
pub const DEFAULT_ADDRESS: u8 = 0x40;
/// Shunt fitted on common breakouts ("R100").
pub const BREAKOUT_SHUNT_MILLIOHM: u32 = 100;

/// Register map.
mod reg {
    pub const CONFIG: u8 = 0x00;
    pub const SHUNT_VOLTAGE: u8 = 0x01;
    pub const BUS_VOLTAGE: u8 = 0x02;
}

/// Register values used by this driver.
mod val {
    /// Self-clearing reset bit of `CONFIG`.
    pub const RESET: u16 = 0x8000;
    /// `CONFIG` after reset; the chip has no ID register, so this identifies it.
    pub const POWER_ON_CONFIG: u16 = 0x399F;
    /// BRNG=16 V, PG=/8, BADC=12-bit, SADC=128 samples, shunt+bus continuous.
    pub const BENCH_CONFIG: u16 = 0x19FF;
    /// Shunt-voltage LSB, nV.
    pub const SHUNT_LSB_NV: i64 = 10_000;
    /// Bus-voltage LSB, mV (value sits in bits 15..3).
    pub const BUS_LSB_MV: u32 = 4;
    /// Bus register bit: a conversion overflowed the range.
    pub const BUS_OVERFLOW: u16 = 0x0001;
}

/// INA219 on an I²C bus with a known shunt.
pub struct Ina219<I> {
    i2c: I,
    address: u8,
    shunt_milliohm: u32,
    ready: bool,
}

impl<I: I2c> Ina219<I> {
    /// Wrap the bus. The chip is touched only on probe.
    ///
    /// # Panics
    /// If `shunt_milliohm` is zero.
    #[must_use]
    pub fn new(i2c: I, address: u8, shunt_milliohm: u32) -> Self {
        assert!(shunt_milliohm > 0, "shunt resistance must be positive");
        Self {
            i2c,
            address,
            shunt_milliohm,
            ready: false,
        }
    }

    /// Give the bus back (tests check the mock's expectations through it).
    pub fn release(self) -> I {
        self.i2c
    }

    fn write(&mut self, register: u8, value: u16) -> Result<(), Error> {
        let [msb, lsb] = value.to_be_bytes();
        self.i2c
            .write(self.address, &[register, msb, lsb])
            .map_err(|_| Error::Io)
    }

    fn read(&mut self, register: u8) -> Result<u16, Error> {
        let mut out = [0u8; 2];
        self.i2c
            .write_read(self.address, &[register], &mut out)
            .map_err(|_| Error::Io)?;
        Ok(u16::from_be_bytes(out))
    }
}

impl<I: I2c> PowerMeter for Ina219<I> {
    fn probe(&mut self) -> Result<(), Error> {
        self.ready = false;
        self.write(reg::CONFIG, val::RESET)
            .map_err(|_| Error::NotFound)?;
        if self.read(reg::CONFIG)? != val::POWER_ON_CONFIG {
            return Err(Error::NotFound);
        }
        self.write(reg::CONFIG, val::BENCH_CONFIG)?;
        if self.read(reg::CONFIG)? != val::BENCH_CONFIG {
            return Err(Error::Io);
        }
        self.ready = true;
        Ok(())
    }

    fn sample(&mut self) -> Result<PowerSample, Error> {
        if !self.ready {
            return Err(Error::State);
        }
        let bus = self.read(reg::BUS_VOLTAGE)?;
        if bus & val::BUS_OVERFLOW != 0 {
            return Err(Error::Rejected);
        }
        // Two's complement, sign-extended by the chip for any PGA setting.
        let shunt = i16::from_ne_bytes(self.read(reg::SHUNT_VOLTAGE)?.to_ne_bytes());
        // nV / mΩ = µA.
        let current = i64::from(shunt) * val::SHUNT_LSB_NV / i64::from(self.shunt_milliohm);
        Ok(PowerSample {
            current_ua: i32::try_from(current).unwrap_or(i32::MAX),
            bus_mv: u32::from(bus >> 3) * val::BUS_LSB_MV,
        })
    }
}
