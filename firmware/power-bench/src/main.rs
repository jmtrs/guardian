//! # Guardian power bench — composition root
//!
//! Runs on a separate ESP32-S3 that stays awake while the device under test
//! sleeps. An INA219 sits in series with the device battery (wiring in
//! `docs/hardware/img/ina219-bench-wiring.png`); every [`SAMPLE_PERIOD`] its
//! reading is folded into a [`PowerWindow`] and one summary line per
//! [`WINDOW`] goes to the USB console. Accounting lives in `guardian-core`,
//! the driver in `guardian-drivers`, both tested on the host.

use std::time::{Duration, Instant};

use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::i2c::{I2cConfig, I2cDriver};
use esp_idf_svc::hal::peripherals::Peripherals;
use esp_idf_svc::hal::units::Hertz;
use esp_idf_svc::sys::EspError;
use guardian_core::ports::PowerMeter;
use guardian_core::power::PowerWindow;
use guardian_drivers::ina219::{Ina219, BREAKOUT_SHUNT_MILLIOHM, DEFAULT_ADDRESS};

/// INA219 conversion time with 128-sample shunt averaging is 68 ms.
const SAMPLE_PERIOD: Duration = Duration::from_millis(70);
/// One summary line per window.
const WINDOW: Duration = Duration::from_secs(1);
/// Pause between probe attempts while the meter is missing.
const RETRY_MS: u32 = 2_000;
const I2C_HZ: u32 = 400_000;

fn main() -> Result<(), EspError> {
    esp_idf_svc::sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();
    let p = Peripherals::take()?;

    // SDA = GPIO8, SCL = GPIO9. The breakout carries its own pull-ups.
    let i2c = I2cDriver::new(
        p.i2c0,
        p.pins.gpio8,
        p.pins.gpio9,
        &I2cConfig::new().baudrate(Hertz(I2C_HZ)),
    )?;
    let mut meter = Ina219::new(i2c, DEFAULT_ADDRESS, BREAKOUT_SHUNT_MILLIOHM);

    while let Err(e) = meter.probe() {
        println!(
            "INA219 at {DEFAULT_ADDRESS:#04x}: {e}. Check Sda->GPIO8, Scl->GPIO9, Vcc->3V3, Gnd."
        );
        FreeRtos::delay_ms(RETRY_MS);
    }
    println!("INA219 ready. I = window mean, avg = mean since start, V = device supply.");

    let mut window = PowerWindow::new(WINDOW);
    let mut last = Instant::now();
    loop {
        FreeRtos::delay_ms(u32::try_from(SAMPLE_PERIOD.as_millis()).unwrap_or(u32::MAX));
        let now = Instant::now();
        let dt = now - last;
        last = now;
        match meter.sample() {
            Ok(sample) => {
                if let Some(summary) = window.push(sample, dt) {
                    println!("{summary}");
                }
            }
            Err(e) => println!("sample failed: {e}"),
        }
    }
}
