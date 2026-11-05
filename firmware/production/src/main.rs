//! Guardian production candidate: one durable movement wake cycle.

mod connectivity;
mod power;
mod store;
mod wake;

use std::thread;
use std::time::Duration;

use connectivity::Connectivity;
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
use esp_idf_svc::sys;
use guardian_core::accel::Threshold;
use guardian_core::error::{Error, Result};
use guardian_core::ports::{MotionSensor, WakeCause};
use guardian_device::cycle::{DeviceCycle, Stage, StepResult};
use guardian_device::motion::{
    arm_for_sleep, capture_latched_motion, observe_motion, prepare_for_active_cycle,
};
use guardian_device::outbox::{drain, DrainOutcome};
use guardian_device::ports::{EventStore, PowerSampler, WakeTimer};
use guardian_drivers::lis3dh::Lis3dh;
use guardian_esp32::board::{self, Board};
use guardian_esp32::modem::{ModemPins, A7670};
use power::AdcPowerSampler;
use store::ProductionStore;
use wake::{restart_now, wake_cause, Esp32WakeTimer};

const RETRY_WAKE_SECONDS: u32 = 5 * 60;
const RELATCH_SETTLE: Duration = Duration::from_millis(50);
const RESTART_AFTER_ERROR: Duration = Duration::from_secs(30);
const BACKEND_URL: &str = match option_env!("GUARDIAN_BACKEND_URL") {
    Some(url) => url,
    None => "https://gtapi.aggc.dev",
};

fn main() {
    sys::link_patches();
    esp_idf_svc::log::EspLogger::initialize_default();
    if let Err(error) = run() {
        log::error!("production cycle stopped safely: {error}");
        thread::sleep(RESTART_AFTER_ERROR);
        // SAFETY: deliberate whole-chip restart after a fail-closed cycle.
        unsafe { sys::esp_restart() };
    }
}

fn run() -> Result<()> {
    let board = Board::take(Peripherals::take().map_err(|_| Error::Io)?).map_err(|_| Error::Io)?;
    let motion_wake = board.motion_int.pin();
    let woke_by_motion = wake_cause() == WakeCause::Motion;

    let battery_adc = AdcDriver::new(board.battery_adc).map_err(|_| Error::Io)?;
    let battery_config = AdcChannelConfig {
        attenuation: DB_12,
        calibration: Calibration::Line,
        ..Default::default()
    };
    let battery = AdcChannelDriver::new(battery_adc, board.battery_sense, &battery_config)
        .map_err(|_| Error::Io)?;
    let mut power = AdcPowerSampler::new(battery, board::BATTERY_DIVIDER_X1000);

    let mut store = ProductionStore::open(EspDefaultNvsPartition::take().map_err(|_| Error::Io)?)
        .map_err(|_| Error::Io)?;
    let (device, root) = store.load_identity()?;

    let modem_pads = (board.modem_tx.pin(), board.modem_rx.pin());
    let modem_uart = UartDriver::new(
        board.modem_uart,
        board.modem_tx,
        board.modem_rx,
        AnyIOPin::none(),
        AnyIOPin::none(),
        &UartConfig::default().baudrate(Hertz(board::MODEM_BAUD)),
    )
    .map_err(|_| Error::Io)?;
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
        Box::new(|_| {}),
        BACKEND_URL,
    )
    .map_err(|_| Error::Io)?;
    let mut connectivity = Connectivity::new(modem, device, &root);
    drop(root);

    let i2c_config = I2cConfig::new()
        .baudrate(Hertz(board::MOTION_I2C_HZ))
        .sda_enable_pullup(true)
        .scl_enable_pullup(true);
    let i2c = I2cDriver::new(
        board.motion_i2c,
        board.motion_sda,
        board.motion_scl,
        &i2c_config,
    )
    .map_err(|_| Error::Io)?;
    let int1 = PinDriver::input(board.motion_int, Pull::Floating).map_err(|_| Error::Io)?;
    let mut motion = Lis3dh::new(i2c, int1, FreeRtos);
    let mut wake = Esp32WakeTimer::new(motion_wake);

    execute_cycle(
        &device,
        woke_by_motion,
        &mut store,
        &mut connectivity,
        &mut power,
        &mut motion,
        &mut wake,
    )
}

fn execute_cycle<M: MotionSensor, P: PowerSampler>(
    device: &guardian_protocol::identity::DeviceId,
    woke_by_motion: bool,
    store: &mut ProductionStore,
    connectivity: &mut Connectivity,
    power: &mut P,
    motion: &mut M,
    wake: &mut Esp32WakeTimer,
) -> Result<()> {
    let mut cycle = DeviceCycle::new(false);
    let mut outbox_blocked = false;

    loop {
        match cycle.stage() {
            Stage::BootOrWake => {
                // Preserve RTC wake evidence before fallible I2C and arm
                // immediately, so motion is latched throughout NTP/HTTPS and
                // the comparatively slow modem shutdown.
                if woke_by_motion {
                    store.defer_motion()?;
                }
                let _captured =
                    prepare_for_active_cycle(store, motion, Threshold::DEFAULT, || {
                        thread::sleep(RELATCH_SETTLE);
                    })?;
                cycle.advance(StepResult::Done)?;
            }
            Stage::DrainOutbox => {
                let result = match drain(store, connectivity)? {
                    DrainOutcome::Empty | DrainOutcome::Delivered { .. } => {
                        outbox_blocked = false;
                        StepResult::OutboxReady
                    }
                    DrainOutcome::Retained => {
                        outbox_blocked = true;
                        StepResult::OutboxRetained
                    }
                };
                cycle.advance(result)?;
            }
            Stage::ObserveMotion => {
                // BootOrWake already made the RTC wake cause durable. Passing
                // it again would manufacture a second motion generation.
                let observed = observe_motion(device, false, store, motion, connectivity, power)?;
                cycle.advance(StepResult::MotionHandled {
                    detected: observed.detected,
                    durable: observed.detected,
                })?;
            }
            Stage::PollCommands => {
                cycle.advance(StepResult::Commands {
                    locate_requested: false,
                })?;
            }
            Stage::Arm => {
                connectivity.shutdown_and_park()?;
                let late_motion = arm_for_sleep(store, motion, Threshold::DEFAULT, || {
                    thread::sleep(RELATCH_SETTLE);
                })?;
                if late_motion && !outbox_blocked {
                    restart_now();
                }
                wake.arm_after(RETRY_WAKE_SECONDS)?;
                cycle.advance(StepResult::Done)?;
            }
            Stage::Sleep => {
                let late_motion = capture_latched_motion(store, motion, || {
                    thread::sleep(RELATCH_SETTLE);
                })?;
                if late_motion && !outbox_blocked {
                    restart_now();
                }
                wake.sleep()?;
                cycle.advance(StepResult::Done)?;
            }
            Stage::Complete => return Ok(()),
            Stage::OptionalLocate | Stage::HeartbeatIfDue => return Err(Error::State),
        }
    }
}
