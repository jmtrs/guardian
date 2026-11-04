//! ST LIS3DH accelerometer over I²C.
//!
//! Generic over [`embedded_hal`] traits, so the same driver runs on ESP-IDF
//! and against mocks on the host. The motion interrupt follows ST AN3308
//! §6.3 (wake-up): high-pass filter on IA1 so gravity is ignored, OR of the
//! X/Y/Z high events, latched on INT1 until `INT1_SRC` is read.

use core::time::Duration;

use embedded_hal::delay::DelayNs;
use embedded_hal::digital::InputPin;
use embedded_hal::i2c::I2c;
use guardian_core::accel::{Accel, Threshold};
use guardian_core::ports::{MotionSensor, SensorInfo};
use guardian_core::Error;

/// I²C addresses: SA0/SDO low, then high.
pub const ADDRESSES: [u8; 2] = [0x18, 0x19];
/// `WHO_AM_I` value of a LIS3DH (a LIS3DSH answers 0x3F).
pub const CHIP_ID: u8 = 0x33;

/// Register map (datasheet `DocID17530`, §7).
mod reg {
    pub const WHO_AM_I: u8 = 0x0F;
    pub const CTRL1: u8 = 0x20;
    pub const CTRL2: u8 = 0x21;
    pub const CTRL3: u8 = 0x22;
    pub const CTRL4: u8 = 0x23;
    pub const CTRL5: u8 = 0x24;
    pub const REFERENCE: u8 = 0x26;
    pub const OUT_X_L: u8 = 0x28;
    pub const INT1_CFG: u8 = 0x30;
    pub const INT1_SRC: u8 = 0x31;
    pub const INT1_THS: u8 = 0x32;
    pub const INT1_DURATION: u8 = 0x33;
    /// Sub-address MSB: auto-increment for multi-byte reads.
    pub const AUTO_INCREMENT: u8 = 0x80;
}

/// Register values used by this driver.
mod val {
    /// ODR 100 Hz, normal mode, X/Y/Z on.
    pub const CTRL1_100HZ_XYZ: u8 = 0x57;
    /// ODR 10 Hz: enough to wake, lower current.
    pub const CTRL1_10HZ_XYZ: u8 = 0x27;
    /// High-pass filter on interrupt generator 1.
    pub const CTRL2_HP_IA1: u8 = 0x01;
    /// Route IA1 to INT1.
    pub const CTRL3_I1_IA1: u8 = 0x40;
    /// Block data update + high resolution, ±2 g.
    pub const CTRL4_BDU_HR: u8 = 0x88;
    /// Latch INT1 until `INT1_SRC` is read.
    pub const CTRL5_LIR_INT1: u8 = 0x08;
    /// OR of XH, YH, ZH events.
    pub const INT1_CFG_XYZ_HIGH: u8 = 0x2A;
    /// `INT1_THS` LSB at ±2 g, in mg.
    pub const THRESHOLD_STEP_MG: u16 = 16;
}

/// High-pass filter settling time after arming.
const FILTER_SETTLE: Duration = Duration::from_millis(300);
/// Output settling after enabling sampling.
const SAMPLING_SETTLE: Duration = Duration::from_millis(20);

/// LIS3DH on an I²C bus, with its INT1 line and a delay source.
pub struct Lis3dh<I, P, D> {
    i2c: I,
    int1: P,
    delay: D,
    address: Option<u8>,
}

impl<I: I2c, P: InputPin, D: DelayNs> Lis3dh<I, P, D> {
    /// Wrap the bus, interrupt pin and delay. The chip is touched only on probe.
    pub fn new(i2c: I, int1: P, delay: D) -> Self {
        Self {
            i2c,
            int1,
            delay,
            address: None,
        }
    }

    /// Give the bus, pin and delay back.
    pub fn release(self) -> (I, P, D) {
        (self.i2c, self.int1, self.delay)
    }

    fn address(&self) -> Result<u8, Error> {
        self.address.ok_or(Error::State)
    }

    fn write(&mut self, register: u8, value: u8) -> Result<(), Error> {
        let address = self.address()?;
        self.i2c
            .write(address, &[register, value])
            .map_err(|_| Error::Io)
    }

    fn read(&mut self, register: u8, out: &mut [u8]) -> Result<(), Error> {
        let address = self.address()?;
        let sub = if out.len() > 1 {
            register | reg::AUTO_INCREMENT
        } else {
            register
        };
        self.i2c
            .write_read(address, &[sub], out)
            .map_err(|_| Error::Io)
    }

    /// `WHO_AM_I` at `address`, `None` if nothing (or not a LIS3DH) answers.
    fn identify(&mut self, address: u8) -> Option<u8> {
        let mut id = [0];
        self.i2c
            .write_read(address, &[reg::WHO_AM_I], &mut id)
            .ok()?;
        (id[0] == CHIP_ID).then_some(address)
    }

    fn delay(&mut self, duration: Duration) {
        self.delay
            .delay_ms(u32::try_from(duration.as_millis()).unwrap_or(u32::MAX));
    }
}

impl<I: I2c, P: InputPin, D: DelayNs> MotionSensor for Lis3dh<I, P, D> {
    fn probe(&mut self) -> Result<SensorInfo, Error> {
        if self.address.is_none() {
            self.address = ADDRESSES.iter().find_map(|&a| self.identify(a));
            self.address.ok_or(Error::NotFound)?;
            let configured = self
                .write(reg::CTRL1, val::CTRL1_100HZ_XYZ)
                .and_then(|()| self.write(reg::CTRL4, val::CTRL4_BDU_HR));
            if let Err(e) = configured {
                self.address = None; // retry from scratch on the next probe
                return Err(e);
            }
            self.delay(SAMPLING_SETTLE);
        }
        Ok(SensorInfo {
            address: self.address()?,
            chip_id: CHIP_ID,
        })
    }

    fn read(&mut self) -> Result<Accel, Error> {
        let mut raw = [0u8; 6];
        Lis3dh::read(self, reg::OUT_X_L, &mut raw)?;
        // 12-bit left-justified two's complement; 1 mg/digit in HR at ±2 g.
        let axis = |lo: u8, hi: u8| i16::from_le_bytes([lo, hi]) >> 4;
        Ok(Accel::new(
            axis(raw[0], raw[1]),
            axis(raw[2], raw[3]),
            axis(raw[4], raw[5]),
        ))
    }

    fn arm(&mut self, threshold: Threshold) -> Result<(), Error> {
        let steps = u8::try_from(threshold.mg() / val::THRESHOLD_STEP_MG).unwrap_or(0x7F);
        let sequence = [
            (reg::CTRL1, val::CTRL1_10HZ_XYZ),
            (reg::CTRL2, val::CTRL2_HP_IA1),
            (reg::CTRL3, val::CTRL3_I1_IA1),
            (reg::CTRL4, val::CTRL4_BDU_HR),
            (reg::CTRL5, val::CTRL5_LIR_INT1),
            (reg::INT1_THS, steps),
            (reg::INT1_DURATION, 0),
        ];
        for (register, value) in sequence {
            self.write(register, value)?;
        }
        let mut reference = [0];
        Lis3dh::read(self, reg::REFERENCE, &mut reference)?; // resets the HP filter
        self.write(reg::INT1_CFG, val::INT1_CFG_XYZ_HIGH)?;
        self.delay(FILTER_SETTLE);
        self.acknowledge().map(|_| ()) // drop events latched while settling
    }

    /// A pin read error counts as triggered: fail-safe, it blocks deep sleep.
    fn is_triggered(&mut self) -> bool {
        self.int1.is_high().unwrap_or(true)
    }

    fn acknowledge(&mut self) -> Result<u8, Error> {
        let mut source = [0];
        Lis3dh::read(self, reg::INT1_SRC, &mut source)?; // reading clears the latch
        Ok(source[0])
    }
}
