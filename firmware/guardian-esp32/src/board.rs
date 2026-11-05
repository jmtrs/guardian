//! LILYGO T-A7670E (ESP32 version) pin map plus Guardian's wiring.
//!
//! Source: `Xinyuan-LilyGO/LilyGo-Modem-Series`, `examples/ATdebug/utilities.h`,
//! block `LILYGO_T_A7670`. Cross-check against the silkscreen of the received
//! unit. This is the only module that names physical pins: [`Board::take`]
//! turns raw peripherals into roles, after releasing any pad hold left by a
//! previous deep sleep (a held pad ignores writes and cannot be re-muxed, so
//! this must happen before any driver touches a pin).

use esp_idf_svc::hal::adc::ADC1;
use esp_idf_svc::hal::gpio::{
    Gpio1, Gpio12, Gpio21, Gpio22, Gpio25, Gpio26, Gpio27, Gpio3, Gpio34, Gpio35, Gpio4, Gpio5, Pin,
};
use esp_idf_svc::hal::i2c::I2C0;
use esp_idf_svc::hal::peripherals::Peripherals;
use esp_idf_svc::hal::uart::{UART0, UART1};
use esp_idf_svc::sys::EspError;

use crate::hold;

/// Modem UART baud rate.
pub const MODEM_BAUD: u32 = 115_200;
/// Console UART baud rate (matches `CONFIG_ESP_CONSOLE_UART_BAUDRATE`).
pub const CONSOLE_BAUD: u32 = 115_200;
/// Modem reset is active HIGH on this board.
pub const MODEM_RESET_ACTIVE_HIGH: bool = true;
/// Battery divider R7/R9 ratio ×1000 (schematic V1.4 p4). Assumed 2:1 until
/// measured with a multimeter.
pub const BATTERY_DIVIDER_X1000: u32 = 2000;
/// LIS3DH I²C clock.
pub const MOTION_I2C_HZ: u32 = 400_000;

/// Board peripherals, named by role.
pub struct Board {
    /// Operator console (USB serial bridge).
    pub console_uart: UART0<'static>,
    /// Console TX.
    pub console_tx: Gpio1<'static>,
    /// Console RX.
    pub console_rx: Gpio3<'static>,

    /// Modem UART.
    pub modem_uart: UART1<'static>,
    /// MCU TX → modem RX.
    pub modem_tx: Gpio26<'static>,
    /// Modem TX → MCU RX.
    pub modem_rx: Gpio27<'static>,
    /// Modem supply switch, HIGH = powered. Strapping pin (MTDI): only driven
    /// after boot. RTC pad.
    pub modem_power_enable: Gpio12<'static>,
    /// Power key, pulse HIGH. RTC pad.
    pub modem_pwrkey: Gpio4<'static>,
    /// Modem reset, see [`MODEM_RESET_ACTIVE_HIGH`].
    pub modem_reset: Gpio5<'static>,
    /// DTR: LOW keeps the modem UART awake.
    pub modem_dtr: Gpio25<'static>,

    /// Battery sense ADC unit.
    pub battery_adc: ADC1<'static>,
    /// IO35 = ADC1 channel 7, behind divider R7/R9.
    pub battery_sense: Gpio35<'static>,

    /// I²C controller for the LIS3DH.
    pub motion_i2c: I2C0<'static>,
    /// LIS3DH SDA.
    pub motion_sda: Gpio21<'static>,
    /// LIS3DH SCL.
    pub motion_scl: Gpio22<'static>,
    /// LIS3DH INT1. Input-only RTC pad (ext0 wake, level HIGH) with no internal
    /// pulls: an external ~100 kΩ pull-down is required so a loose wire cannot
    /// float the line and wake the board in a loop.
    pub motion_int: Gpio34<'static>,
}

impl Board {
    /// Release deep-sleep pad holds, then assign every peripheral to its role.
    ///
    /// # Errors
    /// If a held pad cannot be released (it would silently ignore writes).
    pub fn take(p: Peripherals) -> Result<Self, EspError> {
        let pins = p.pins;
        hold::disable_during_deep_sleep();
        // Every pad `modem::A7670::park_for_sleep` latches.
        [
            pins.gpio12.pin(),
            pins.gpio4.pin(),
            pins.gpio5.pin(),
            pins.gpio25.pin(),
            pins.gpio26.pin(),
        ]
        .into_iter()
        .try_for_each(hold::release)?;
        Ok(Self {
            console_uart: p.uart0,
            console_tx: pins.gpio1,
            console_rx: pins.gpio3,
            modem_uart: p.uart1,
            modem_tx: pins.gpio26,
            modem_rx: pins.gpio27,
            modem_power_enable: pins.gpio12,
            modem_pwrkey: pins.gpio4,
            modem_reset: pins.gpio5,
            modem_dtr: pins.gpio25,
            battery_adc: p.adc1,
            battery_sense: pins.gpio35,
            motion_i2c: p.i2c0,
            motion_sda: pins.gpio21,
            motion_scl: pins.gpio22,
            motion_int: pins.gpio34,
        })
    }
}
