//! `SIMCom` A7670 adapter: power sequencing and sleep parking, over the
//! [`AtTransport`] for commands.
//!
//! Power-on sequence mirrors LILYGO `examples/ATdebug` for `LILYGO_T_A7670`.

mod capture;
mod http;
mod tls;
mod transport;

use std::thread;
use std::time::Duration;

use esp_idf_svc::hal::gpio::{Output, OutputPin, PinDriver, PinId};
use esp_idf_svc::hal::uart::UartDriver;
use esp_idf_svc::sys::EspError;
use guardian_core::ports::Modem;
use guardian_core::Error;

use transport::AtTransport;
pub use transport::LineSink;

use crate::hold;

/// Index of the UART TX pad in `A7670::pads`.
const TX: usize = 4;

/// PWRKEY HIGH time to switch on.
const POWERON_PULSE: Duration = Duration::from_millis(100);
/// PWRKEY HIGH time to switch off (LILYGO `utilities.h`, A7670).
const POWEROFF_PULSE: Duration = Duration::from_secs(3);
const RESET_PULSE: Duration = Duration::from_millis(2600);
const PRE_PULSE: Duration = Duration::from_millis(100);
/// Extra wait when the first probes after power-on fail.
const BOOT_WAIT: Duration = Duration::from_secs(3);
const AT_PROBE: Duration = Duration::from_secs(1);
const CPOF_TIMEOUT: Duration = Duration::from_secs(5);
const SHUTDOWN_WAIT: Duration = Duration::from_secs(2);
const CSCLK_TIMEOUT: Duration = Duration::from_secs(2);

/// GPIO lines from the MCU to the modem.
pub struct ModemPins<E, K, R, D> {
    /// Supply switch, HIGH = powered.
    pub power_enable: E,
    /// Power key, pulse HIGH.
    pub pwrkey: K,
    /// Reset line.
    pub reset: R,
    /// Active level of `reset`.
    pub reset_active_high: bool,
    /// Data terminal ready; LOW keeps the modem UART awake.
    pub dtr: D,
}

/// The A7670 on the T-A7670E.
pub struct A7670 {
    at: AtTransport,
    power_enable: PinDriver<'static, Output>,
    pwrkey: PinDriver<'static, Output>,
    reset: PinDriver<'static, Output>,
    reset_active_high: bool,
    dtr: PinDriver<'static, Output>,
    /// Every pad wired to the modem, for sleep hold; UART TX at index [`TX`].
    pads: [PinId; 5],
    /// Backend base URL for [`Uplink`](guardian_core::ports::Uplink), no
    /// trailing slash.
    backend: &'static str,
}

impl A7670 {
    /// Take the pins and start the reader thread. Pad holds from a previous
    /// sleep must already be released (see [`Board::take`](crate::board::Board::take)).
    ///
    /// # Errors
    /// GPIO configuration or thread spawn failure.
    pub fn new<E, K, R, D>(
        uart: UartDriver<'static>,
        (tx_pad, rx_pad): (PinId, PinId),
        pins: ModemPins<E, K, R, D>,
        sink: LineSink,
        backend: &'static str,
    ) -> Result<Self, EspError>
    where
        E: OutputPin + 'static,
        K: OutputPin + 'static,
        R: OutputPin + 'static,
        D: OutputPin + 'static,
    {
        let pads = [
            pins.power_enable.pin(),
            pins.pwrkey.pin(),
            pins.reset.pin(),
            pins.dtr.pin(),
            tx_pad,
        ];
        let mut modem = Self {
            at: AtTransport::start(uart, (tx_pad, rx_pad), sink)?,
            power_enable: PinDriver::output(pins.power_enable)?,
            pwrkey: PinDriver::output(pins.pwrkey)?,
            reset: PinDriver::output(pins.reset)?,
            reset_active_high: pins.reset_active_high,
            dtr: PinDriver::output(pins.dtr)?,
            pads,
            backend,
        };
        // PinDriver::output keeps whatever the output latch holds: start from
        // a known state. Control lines first (PWRKEY idle, reset inactive,
        // DTR low = UART awake), supply last. Supply on so a modem that stayed
        // alive across an MCU reset is not cut; a cold modem then sits
        // energised but off until `!modem on`, `!modem off` or `!sleep`.
        modem.pwrkey.set_low()?;
        modem.set_reset(false)?;
        modem.dtr.set_low()?;
        modem.power_enable.set_high()?;
        Ok(modem)
    }

    fn answers_at(&mut self, attempts: u32) -> bool {
        (0..attempts).any(|_| self.command("AT", AT_PROBE).is_ok())
    }

    fn pulse_pwrkey(&mut self, high: Duration) -> Result<(), EspError> {
        self.pwrkey.set_low()?;
        thread::sleep(PRE_PULSE);
        self.pwrkey.set_high()?;
        thread::sleep(high);
        self.pwrkey.set_low()
    }

    fn set_reset(&mut self, active: bool) -> Result<(), EspError> {
        if active == self.reset_active_high {
            self.reset.set_high()
        } else {
            self.reset.set_low()
        }
    }

    fn power_on_sequence(&mut self) -> Result<(), EspError> {
        self.set_reset(false)?;
        thread::sleep(PRE_PULSE);
        self.set_reset(true)?;
        thread::sleep(RESET_PULSE);
        self.set_reset(false)?;
        self.pulse_pwrkey(POWERON_PULSE)
    }

    /// Drive every line to its "off" level, park TX, latch all pads.
    fn try_park(&mut self) -> Result<(), EspError> {
        self.power_enable.set_low()?;
        self.pwrkey.set_low()?;
        self.set_reset(false)?;
        self.dtr.set_low()?;
        hold::park(self.pads[TX], false)?;
        self.pads.into_iter().try_for_each(hold::hold)
    }

    /// Supply on, control lines idle, DTR high (sleep allowed), TX idle
    /// high, then latch all pads. `AT+CSCLK=1` must already be set.
    fn try_standby(&mut self) -> Result<(), EspError> {
        self.pwrkey.set_low()?;
        self.set_reset(false)?;
        self.power_enable.set_high()?;
        self.dtr.set_high()?;
        hold::park(self.pads[TX], true)?;
        self.pads.into_iter().try_for_each(hold::hold)
    }

    /// Undo a partial [`try_park`](Self::try_park): release every latch and
    /// route TX back to the UART. Lines stay at their "off" levels.
    fn rollback_park(&mut self) {
        for pad in self.pads {
            if let Err(e) = hold::release(pad) {
                log::error!("GPIO{pad} stays latched after aborted park: {e}");
            }
        }
        if let Err(e) = self.at.reattach() {
            log::error!("modem TX not re-routed to UART: {e}");
        }
    }
}

impl Modem for A7670 {
    fn power_on(&mut self) -> Result<(), Error> {
        self.power_enable.set_high().map_err(|_| Error::Io)?;
        self.dtr.set_low().map_err(|_| Error::Io)?;
        // The modem survives an MCU reset: reuse it if it already answers. Even
        // if it is on but still booting, the 100 ms pulse cannot switch it off,
        // because power-down needs a long press. Bench-confirm on the unit.
        if self.answers_at(3) {
            return Ok(());
        }
        self.power_on_sequence().map_err(|_| Error::Io)?;
        log::info!("power-on pulse sent, waiting for AT");
        if self.answers_at(3) {
            return Ok(());
        }
        thread::sleep(BOOT_WAIT);
        if self.answers_at(20) {
            Ok(())
        } else {
            Err(Error::Timeout)
        }
    }

    fn power_off(&mut self) {
        // A long PWRKEY press toggles power, so it is only used on a modem that
        // is provably alive. A silent modem is off or hung; in both cases
        // opening the supply switch is the only safe action.
        if !self.answers_at(2) {
            log::info!("modem not answering: cutting supply");
        } else if self.command("AT+CPOF", CPOF_TIMEOUT).is_err() && self.answers_at(2) {
            log::warn!("AT+CPOF failed but modem alive: long-pressing PWRKEY");
            let _ = self.pulse_pwrkey(POWEROFF_PULSE);
        }
        thread::sleep(SHUTDOWN_WAIT);
        if self.power_enable.set_low().is_err() {
            log::error!("could not open the modem supply switch");
        }
    }

    fn command(&mut self, cmd: &str, timeout: Duration) -> Result<(), Error> {
        self.at.command(cmd, timeout)
    }

    fn send_raw(&mut self, line: &str) {
        self.at.send_raw(line);
    }

    fn park_for_sleep(&mut self) -> Result<(), Error> {
        self.try_park().map_err(|e| {
            log::error!("cannot park modem lines for sleep: {e}");
            self.rollback_park();
            Error::Io
        })
    }

    fn park_in_standby(&mut self) -> Result<(), Error> {
        // DTR-controlled sleep: the modem sleeps only while DTR is high, so a
        // wake (DTR low again in `new`) is deterministic.
        self.command("AT+CSCLK=1", CSCLK_TIMEOUT)?;
        self.try_standby().map_err(|e| {
            log::error!("cannot hold modem lines in standby: {e}");
            self.rollback_park();
            if let Err(e) = self.dtr.set_low() {
                log::error!("DTR stays high: modem may sleep while awake: {e}");
            }
            Error::Io
        })
    }
}
