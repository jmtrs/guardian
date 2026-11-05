//! # Guardian bring-up — composition root
//!
//! Bench tool for the LILYGO T-A7670E. Builds every adapter from the
//! [`guardian_esp32::board`] roles, injects them into
//! [`guardian_core::bringup::Bringup`] and runs the
//! console loop. No logic lives here: domain rules and use cases are in
//! `guardian-core`, drivers in `guardian-drivers`, both tested on the host.

mod console;
mod identity;
mod platform;
mod store;
mod wiring;

use esp_idf_svc::hal::adc::attenuation::DB_12;
use esp_idf_svc::hal::adc::oneshot::config::{AdcChannelConfig, Calibration};
use esp_idf_svc::hal::adc::oneshot::{AdcChannelDriver, AdcDriver};
use esp_idf_svc::hal::delay::FreeRtos;
use esp_idf_svc::hal::gpio::{AnyIOPin, Pin, PinDriver, Pull};
use esp_idf_svc::hal::i2c::{I2cConfig, I2cDriver};
use esp_idf_svc::hal::peripherals::Peripherals;
use esp_idf_svc::hal::uart::{config::Config as UartConfig, UartDriver};
use esp_idf_svc::hal::units::Hertz;
use esp_idf_svc::nvs::EspDefaultNvsPartition;
use esp_idf_svc::sys::EspError;
use guardian_core::bringup::Bringup;
use guardian_drivers::lis3dh::Lis3dh;
use guardian_esp32::board::{self, Board};
use guardian_esp32::modem::{ModemPins, A7670};

use console::{Console, Stdout};
use platform::Esp32Platform;

fn main() -> Result<(), EspError> {
    esp_idf_svc::sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();
    // Releases deep-sleep pad holds before any driver touches a pin.
    let mut board = Board::take(Peripherals::take()?)?;

    let wake_pad = board.motion_int.pin();
    let battery_adc = AdcDriver::new(board.battery_adc)?;
    let battery_config = AdcChannelConfig {
        attenuation: DB_12,
        calibration: Calibration::Line,
        ..Default::default()
    };
    let battery = AdcChannelDriver::new(battery_adc, board.battery_sense, &battery_config)?;
    let store = store::Store::open(EspDefaultNvsPartition::take()?)?;
    // NVS first (provisioned device), then the build environment (bench).
    let (identity, identity_source) = match store.identity() {
        Some(found) => (Some(found), "NVS"),
        None => (identity::from_build(), "build environment"),
    };
    let platform = Esp32Platform::new(battery, board::BATTERY_DIVIDER_X1000, wake_pad, store);

    let modem_pads = (board.modem_tx.pin(), board.modem_rx.pin());
    let modem_uart = UartDriver::new(
        board.modem_uart,
        board.modem_tx,
        board.modem_rx,
        AnyIOPin::none(),
        AnyIOPin::none(),
        &UartConfig::default().baudrate(Hertz(board::MODEM_BAUD)),
    )?;
    let modem = A7670::new(
        modem_uart,
        modem_pads,
        ModemPins {
            power_enable: board.modem_power_enable,
            pwrkey: board.modem_pwrkey,
            reset: board.modem_reset,
            reset_active_high: board::MODEM_RESET_ACTIVE_HIGH,
            dtr: board.modem_dtr,
        },
        Box::new(|line| println!("< {line}")),
        identity::BACKEND_URL,
    )?;

    // Sampled before the I2C driver owns the pads; printed once the console is up.
    let bus_levels = wiring::BusLevels::sample(&mut board.motion_sda, &mut board.motion_scl);

    // Breakouts carry their own pull-ups; internal ones are only a fallback.
    let i2c_config = I2cConfig::new()
        .baudrate(Hertz(board::MOTION_I2C_HZ))
        .sda_enable_pullup(true)
        .scl_enable_pullup(true);
    let i2c = I2cDriver::new(
        board.motion_i2c,
        board.motion_sda,
        board.motion_scl,
        &i2c_config,
    )?;
    let int1 = PinDriver::input(board.motion_int, Pull::Floating)?;
    let motion = Lis3dh::new(i2c, int1, FreeRtos);

    let mut console = Console::new(UartDriver::new(
        board.console_uart,
        board.console_tx,
        board.console_rx,
        AnyIOPin::none(),
        AnyIOPin::none(),
        &UartConfig::default().baudrate(Hertz(board::CONSOLE_BAUD)),
    )?);

    let mut service = Bringup::new(modem, motion, platform, Stdout);
    if let Some(Ok(identity)) = identity.clone() {
        service = service.with_identity(identity);
    }
    service.announce();
    match identity {
        Some(Ok(_)) => println!(
            "device identity: from {identity_source}, backend {}",
            identity::BACKEND_URL
        ),
        Some(Err(e)) => println!("device identity INVALID ({e}): !event disabled"),
        None => println!("device identity: none (!event disabled)"),
    }
    match bus_levels {
        Ok(levels) => println!("{levels}"),
        Err(e) => println!("I2C wiring check failed: {e}"),
    }
    loop {
        let line = console.read_line();
        service.handle_line(&line);
    }
}
