//! # Guardian power bench — composition root
//!
//! Runs on a separate ESP32-S3 that stays awake while the device under test
//! sleeps. An INA219 sits in series with the device battery and the device
//! console is wired to this board (wiring in
//! `docs/hardware/img/ina219-bench-wiring.png`). Every [`SAMPLE_PERIOD`] the
//! reading is folded into a [`PowerWindow`]; one summary line per [`WINDOW`]
//! goes to the Mac, interleaved with the bridged device console ([`link`]).
//! Accounting lives in `guardian-core`, the driver in `guardian-drivers`,
//! both tested on the host.

mod link;

use std::time::{Duration, Instant};

use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::gpio::AnyIOPin;
use esp_idf_svc::hal::i2c::{I2cConfig, I2cDriver};
use esp_idf_svc::hal::peripherals::Peripherals;
use esp_idf_svc::hal::reset::ResetReason;
use esp_idf_svc::hal::uart::{config::Config as UartConfig, UartDriver};
use esp_idf_svc::hal::units::Hertz;
use esp_idf_svc::hal::usb_serial::{config::Config as UsbConfig, UsbSerialDriver};
use esp_idf_svc::sys::EspError;
use guardian_core::ports::PowerMeter;
use guardian_core::power::PowerWindow;
use guardian_drivers::ina219::{Ina219, BREAKOUT_SHUNT_MILLIOHM, DEFAULT_ADDRESS};

use link::{BenchCommand, Host, Link};

/// INA219 conversion time with 128-sample shunt averaging is 68 ms.
const SAMPLE_PERIOD: Duration = Duration::from_millis(70);
/// One summary line per window.
const WINDOW: Duration = Duration::from_secs(1);
/// Main-loop tick: bridge latency and sampling jitter bound.
const TICK_MS: u32 = 10;
/// Pause between probe attempts while the meter is missing.
const RETRY_MS: u32 = 2_000;
const I2C_HZ: u32 = 400_000;
/// Device console speed (bring-up firmware, UART0).
const DEVICE_BAUD: u32 = 115_200;

const HELP: &str = "bench: '~reset' restarts avg/Q, '~help' this text; \
                    other lines go to the device. Device output is prefixed '| '.";

fn main() -> Result<(), EspError> {
    esp_idf_svc::sys::link_patches();
    let p = Peripherals::take()?;

    // INA219: SDA = GPIO8, SCL = GPIO9. The breakout carries its own pull-ups.
    let i2c = I2cDriver::new(
        p.i2c0,
        p.pins.gpio8,
        p.pins.gpio9,
        &I2cConfig::new().baudrate(Hertz(I2C_HZ)),
    )?;
    let mut meter = Ina219::new(i2c, DEFAULT_ADDRESS, BREAKOUT_SHUNT_MILLIOHM);

    // Device console: S3 TX = GPIO17 -> device UART_RX, S3 RX = GPIO18 <- UART_TX.
    let device = UartDriver::new(
        p.uart1,
        p.pins.gpio17,
        p.pins.gpio18,
        AnyIOPin::none(),
        AnyIOPin::none(),
        &UartConfig::default().baudrate(Hertz(DEVICE_BAUD)),
    )?;
    // All output from here on goes through this driver, not stdout.
    let usb = UsbSerialDriver::new(
        p.usb_serial,
        p.pins.gpio19,
        p.pins.gpio20,
        &UsbConfig::new(),
    )?;
    let mut link = Link::new(Host::new(usb), device);
    // A restart mid-measurement loses the totals: make it impossible to miss.
    let reset = ResetReason::get();
    if !matches!(
        reset,
        ResetReason::PowerOn | ResetReason::ExternalPin | ResetReason::USBPeripheral
    ) {
        link.host()
            .line(format_args!("bench: RESTARTED ({reset:?}), totals lost"));
    }

    while let Err(e) = meter.probe() {
        link.host().line(format_args!(
            "INA219 at {DEFAULT_ADDRESS:#04x}: {e}. Check Sda->GPIO8, Scl->GPIO9, Vcc->3V3, Gnd."
        ));
        FreeRtos::delay_ms(RETRY_MS);
    }
    link.host().line(format_args!(
        "INA219 ready. I = window mean, avg/Q = since start, V = device supply."
    ));
    link.host().line(format_args!("{HELP}"));

    let mut window = PowerWindow::new(WINDOW);
    let mut last = Instant::now();
    loop {
        match link.poll() {
            Some(BenchCommand::Reset) => {
                window = PowerWindow::new(WINDOW);
                link.host().line(format_args!("bench: totals reset"));
            }
            Some(BenchCommand::Help | BenchCommand::Unknown) => {
                link.host().line(format_args!("{HELP}"));
            }
            None => {}
        }
        let now = Instant::now();
        if now - last >= SAMPLE_PERIOD {
            let dt = now - last;
            last = now;
            match meter.sample() {
                Ok(sample) => {
                    if let Some(summary) = window.push(sample, dt) {
                        link.host().line(format_args!("{summary}"));
                    }
                }
                Err(e) => link.host().line(format_args!("sample failed: {e}")),
            }
        }
        FreeRtos::delay_ms(TICK_MS);
    }
}
