//! Bench bring-up service.
//!
//! Each use case maps to a step of `docs/COMPONENTES.md`, "Primera secuencia
//! al recibir las piezas". The service depends only on [ports](crate::ports)
//! and a [`fmt::Write`] sink, so it runs on the board and on the host alike.

mod event;
mod modem;
mod motion;

pub use event::{next_sequence, DeviceIdentity};

use core::fmt::{self, Write};
use core::time::Duration;

use crate::accel::Threshold;
use crate::command::Command;
use crate::ports::{Modem, MotionSensor, Platform, Uplink, WakeCause};

/// Samples taken by the sensor self-test.
pub const SELFTEST_SAMPLES: u32 = 10;
/// Interval between self-test samples.
pub const SELFTEST_PERIOD: Duration = Duration::from_millis(100);
/// How long `!arm` watches the interrupt line.
pub const WATCH_DURATION: Duration = Duration::from_secs(30);
/// Poll period of the interrupt line while watching.
pub const WATCH_POLL: Duration = Duration::from_millis(100);

/// Write one formatted line to the operator. A failing sink cannot be reported
/// anywhere else, so its error is deliberately ignored.
macro_rules! say {
    ($self:expr, $($arg:tt)*) => {{
        let _ = writeln!($self.out, $($arg)*);
    }};
}
pub(crate) use say;

/// Bring-up service: the ports it drives plus minimal session state.
pub struct Bringup<M, S, P, W> {
    modem: M,
    motion: S,
    platform: P,
    out: W,
    modem_powered: bool,
    identity: Option<DeviceIdentity>,
}

impl<M: Modem + Uplink, S: MotionSensor, P: Platform, W: Write> Bringup<M, S, P, W> {
    /// Build a service over the given ports and operator sink.
    pub fn new(modem: M, motion: S, platform: P, out: W) -> Self {
        Self {
            modem,
            motion,
            platform,
            out,
            modem_powered: false,
            identity: None,
        }
    }

    /// Give the service the device identity needed by `!event`.
    #[must_use]
    pub fn with_identity(mut self, identity: DeviceIdentity) -> Self {
        self.identity = Some(identity);
        self
    }

    /// Last known modem power state.
    pub fn modem_powered(&self) -> bool {
        self.modem_powered
    }

    /// Print the wake cause and the command list. After a motion wake the
    /// latch is cleared so the next `!sleep` is not aborted.
    pub fn announce(&mut self) {
        match self.platform.wake_cause() {
            WakeCause::Motion => {
                say!(self, "\n*** WAKE: motion interrupt ***");
                match self.motion.probe().and_then(|_| self.motion.acknowledge()) {
                    Ok(source) => say!(self, "interrupt source {source}"),
                    Err(e) => say!(self, "could not clear wake latch: {e}"),
                }
            }
            WakeCause::PowerOn => say!(self, "\nboot: power-on / reset"),
            WakeCause::Other => say!(self, "\nboot: other wake source"),
        }
        self.help();
    }

    /// Print the command list.
    pub fn help(&mut self) {
        say!(
            self,
            "\nGuardian bring-up. '!' = local command; any other line goes to the modem.\n\
             \x20 !diag          board + modem identity, SIM, signal, registration\n\
             \x20 !modem on|off  modem power sequence\n\
             \x20 !gnss          start GNSS (then AT+CGNSSINFO until fix)\n\
             \x20 !lis           accelerometer self-test (expects ~1 g at rest)\n\
             \x20 !arm [mg]      watch motion interrupt for {}s (default {} mg)\n\
             \x20 !sleep [mg]    P1: modem off, deep sleep until motion\n\
             \x20 !standby [mg]  P2: modem in LTE sleep, deep sleep until motion\n\
             \x20 !vbat          battery rail\n\
             \x20 !event         step 7: sign and send a heartbeat to the backend\n\
             \x20 !provision <id> <secret-hex>  store the device identity\n\
             \x20 !help\n",
            WATCH_DURATION.as_secs(),
            Threshold::DEFAULT.mg()
        );
    }

    /// Print the battery rail.
    pub fn battery(&mut self) {
        match self.platform.battery_mv() {
            Some(mv) => say!(self, "vbat: {mv} mV"),
            None => say!(self, "vbat: unavailable"),
        }
    }

    /// Parse a console line and run the matching use case.
    pub fn handle_line(&mut self, line: &str) {
        match Command::parse(line) {
            Command::Empty => {}
            Command::Help => self.help(),
            Command::Diag => self.identify(),
            Command::ModemOn => {
                let _ = self.modem_on();
            }
            Command::ModemOff => self.modem_off(),
            Command::Gnss => {
                let _ = self.gnss_on();
            }
            Command::Sensor => {
                let _ = self.sensor_selftest();
            }
            Command::Arm(threshold) => {
                self.watch_motion(threshold);
            }
            Command::Sleep(threshold) => {
                let _ = self.sleep_until_motion(threshold);
            }
            Command::Standby(threshold) => {
                let _ = self.sleep_with_lte(threshold);
            }
            Command::Battery => self.battery(),
            Command::Event => {
                let _ = self.send_heartbeat();
            }
            Command::Provision { device_id, secret } => {
                let _ = self.provision(device_id, secret);
            }
            Command::At(text) => self.passthrough(text),
            Command::Unknown(word) => say!(self, "unknown command: !{word} (try !help)"),
            Command::InvalidArgument(arg) => say!(self, "invalid argument: {arg}"),
        }
    }
}

/// Formats a MAC address as `aa:bb:cc:dd:ee:ff`.
struct Mac([u8; 6]);

impl fmt::Display for Mac {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, byte) in self.0.iter().enumerate() {
            if i > 0 {
                f.write_str(":")?;
            }
            write!(f, "{byte:02x}")?;
        }
        Ok(())
    }
}
