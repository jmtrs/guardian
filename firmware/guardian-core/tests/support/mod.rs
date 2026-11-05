//! In-memory fakes of every core port, sharing one scriptable [`World`].

use std::cell::RefCell;
use std::fmt;
use std::rc::Rc;
use std::time::Duration;

use guardian_core::accel::{Accel, Threshold};
use guardian_core::bringup::Bringup;
use guardian_core::ports::{
    DeviceRequest, Identity, Latch, Modem, MotionSensor, Platform, SensorInfo, Uplink, WakeCause,
};
use guardian_core::Error;
use guardian_protocol::time::UtcTime;

/// One request captured by the fake uplink. Read only by `tests/event.rs`;
/// the other test binaries share this module.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Posted {
    pub path: String,
    pub device_id: String,
    pub signature: String,
    pub body: String,
}

/// Scriptable state behind all fakes.
pub struct World {
    pub power_on_result: Result<(), Error>,
    pub command_result: Result<(), Error>,
    pub power_on_calls: u32,
    pub power_off_calls: u32,
    pub park_result: Result<(), Error>,
    pub park_calls: u32,
    pub standby_result: Result<(), Error>,
    pub standby_calls: u32,
    pub commands: Vec<String>,
    /// `AT+CPIN?` is rejected this many times before succeeding.
    pub cpin_failures: u32,
    pub raw: Vec<String>,
    pub probe_result: Result<SensorInfo, Error>,
    /// (address, id register) pairs reported by `scan`.
    pub bus: Vec<(u8, u8)>,
    pub sample: Accel,
    pub armed: Option<Threshold>,
    pub arm_calls: u32,
    /// `is_triggered` is true while this is > 0 (each good ack decrements) ...
    pub pending_triggers: u32,
    /// ... or always, if set.
    pub stuck_high: bool,
    pub ack_result: Result<u8, Error>,
    pub ack_calls: u32,
    pub wake: WakeCause,
    pub battery: Option<u32>,
    pub network_time: Result<UtcTime, Error>,
    pub post_status: Result<u16, Error>,
    pub posts: Vec<Posted>,
    pub slept: Duration,
    pub wake_arm_result: Result<(), Error>,
    pub deep_sleeps: u32,
    pub out: String,
}

impl Default for World {
    /// Everything succeeds; sensor at rest on Z; no motion.
    fn default() -> Self {
        Self {
            power_on_result: Ok(()),
            command_result: Ok(()),
            power_on_calls: 0,
            power_off_calls: 0,
            park_result: Ok(()),
            park_calls: 0,
            standby_result: Ok(()),
            standby_calls: 0,
            commands: Vec::new(),
            cpin_failures: 0,
            raw: Vec::new(),
            bus: Vec::new(),
            probe_result: Ok(SensorInfo {
                address: 0x18,
                chip_id: 0x33,
            }),
            sample: Accel::new(10, -20, 1003),
            armed: None,
            arm_calls: 0,
            pending_triggers: 0,
            stuck_high: false,
            ack_result: Ok(0x4A),
            ack_calls: 0,
            wake: WakeCause::PowerOn,
            battery: Some(4100),
            network_time: UtcTime::from_civil(2026, 11, 5, 11, 30, 0).map_err(|_| Error::State),
            post_status: Ok(202),
            posts: Vec::new(),
            slept: Duration::ZERO,
            wake_arm_result: Ok(()),
            deep_sleeps: 0,
            out: String::new(),
        }
    }
}

/// Handle to the shared world; one clone per port.
#[derive(Clone, Default)]
pub struct Fake(pub Rc<RefCell<World>>);

impl Fake {
    pub fn with(configure: impl FnOnce(&mut World)) -> Self {
        let fake = Self::default();
        configure(&mut fake.0.borrow_mut());
        fake
    }

    pub fn service(&self) -> Bringup<Fake, Fake, Fake, Fake> {
        Bringup::new(self.clone(), self.clone(), self.clone(), self.clone())
    }

    pub fn world(&self) -> std::cell::Ref<'_, World> {
        self.0.borrow()
    }

    pub fn printed(&self, needle: &str) -> bool {
        self.world().out.contains(needle)
    }
}

impl Uplink for Fake {
    fn network_time(&mut self) -> Result<UtcTime, Error> {
        self.0.borrow().network_time
    }
    fn post(&mut self, request: &DeviceRequest<'_>) -> Result<u16, Error> {
        let mut w = self.0.borrow_mut();
        w.posts.push(Posted {
            path: request.path.to_owned(),
            device_id: request.device_id.to_owned(),
            signature: request.signature.to_owned(),
            body: String::from_utf8_lossy(request.body).into_owned(),
        });
        w.post_status
    }
}

impl Modem for Fake {
    fn power_on(&mut self) -> Result<(), Error> {
        let mut w = self.0.borrow_mut();
        w.power_on_calls += 1;
        w.power_on_result
    }
    fn power_off(&mut self) {
        self.0.borrow_mut().power_off_calls += 1;
    }
    fn command(&mut self, cmd: &str, _timeout: Duration) -> Result<(), Error> {
        let mut w = self.0.borrow_mut();
        w.commands.push(cmd.to_owned());
        if cmd == "AT+CPIN?" && w.cpin_failures > 0 {
            w.cpin_failures -= 1;
            return Err(Error::Rejected);
        }
        w.command_result
    }
    fn send_raw(&mut self, line: &str) {
        self.0.borrow_mut().raw.push(line.to_owned());
    }
    fn park_for_sleep(&mut self) -> Result<(), Error> {
        let mut w = self.0.borrow_mut();
        w.park_calls += 1;
        w.park_result
    }
    fn park_in_standby(&mut self) -> Result<(), Error> {
        let mut w = self.0.borrow_mut();
        w.standby_calls += 1;
        w.standby_result
    }
}

impl MotionSensor for Fake {
    fn probe(&mut self) -> Result<SensorInfo, Error> {
        self.0.borrow().probe_result
    }
    fn read(&mut self) -> Result<Accel, Error> {
        Ok(self.0.borrow().sample)
    }
    fn arm(&mut self, threshold: Threshold) -> Result<(), Error> {
        let mut w = self.0.borrow_mut();
        w.arm_calls += 1;
        w.armed = Some(threshold);
        Ok(())
    }
    fn is_triggered(&mut self) -> bool {
        let w = self.0.borrow();
        w.stuck_high || w.pending_triggers > 0
    }
    fn acknowledge(&mut self) -> Result<Latch, Error> {
        let mut w = self.0.borrow_mut();
        w.ack_calls += 1;
        if w.ack_result.is_ok() {
            w.pending_triggers = w.pending_triggers.saturating_sub(1);
        }
        w.ack_result.map(|raw| Latch {
            active: raw & 0x40 != 0, // LIS3DH IA bit, as the real driver
            raw,
        })
    }
    fn scan(&mut self, found: &mut dyn FnMut(u8, u8)) {
        let bus = self.0.borrow().bus.clone(); // `found` writes to the world
        for (address, id) in bus {
            found(address, id);
        }
    }
}

impl Platform for Fake {
    fn delay(&mut self, duration: Duration) {
        self.0.borrow_mut().slept += duration;
    }
    fn identity(&mut self) -> Identity {
        Identity {
            chip_revision: 301,
            cores: 2,
            ..Identity::default()
        }
    }
    fn battery_mv(&mut self) -> Option<u32> {
        self.0.borrow().battery
    }
    fn wake_cause(&mut self) -> WakeCause {
        self.0.borrow().wake
    }
    fn arm_motion_wake(&mut self) -> Result<(), Error> {
        self.0.borrow().wake_arm_result
    }
    fn deep_sleep(&mut self) {
        self.0.borrow_mut().deep_sleeps += 1;
    }
}

impl fmt::Write for Fake {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        self.0.borrow_mut().out.push_str(s);
        Ok(())
    }
}
