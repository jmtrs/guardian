//! ESP32 platform adapter: delays, identity, battery ADC, persistent state
//! (NVS, see [`Store`]), deep sleep.

use std::thread;
use std::time::Duration;

use esp_idf_svc::hal::adc::oneshot::{AdcChannelDriver, AdcDriver};
use esp_idf_svc::hal::adc::AdcChannel;
use esp_idf_svc::hal::gpio::PinId;
use esp_idf_svc::sys;
use guardian_core::ports::{Identity, Platform, WakeCause};
use guardian_core::Error;
use guardian_esp32::hold;

use crate::store::Store;

/// Samples averaged per battery reading.
const BATTERY_SAMPLES: u32 = 16;
/// Let the console drain before sleeping.
const SLEEP_FLUSH: Duration = Duration::from_millis(200);

/// Battery sense channel: calibrated one-shot ADC behind a resistor divider.
pub type BatteryChannel<C> =
    AdcChannelDriver<'static, C, AdcDriver<'static, <C as AdcChannel>::AdcUnit>>;

/// The ESP32 of the T-A7670E.
pub struct Esp32Platform<C: AdcChannel> {
    battery: BatteryChannel<C>,
    /// Divider ratio ×1000 (2000 = 2:1).
    divider_x1000: u32,
    /// RTC pad used as ext0 wake source (active HIGH).
    motion_wake: PinId,
    store: Store,
}

impl<C: AdcChannel> Esp32Platform<C> {
    /// Build the adapter. Pad holds from a previous sleep are released by
    /// [`Board::take`](guardian_esp32::board::Board::take), not here.
    #[must_use]
    pub fn new(
        battery: BatteryChannel<C>,
        divider_x1000: u32,
        motion_wake: PinId,
        store: Store,
    ) -> Self {
        Self {
            battery,
            divider_x1000,
            motion_wake,
            store,
        }
    }
}

impl<C: AdcChannel> Platform for Esp32Platform<C> {
    fn delay(&mut self, duration: Duration) {
        thread::sleep(duration);
    }

    fn identity(&mut self) -> Identity {
        let mut chip = sys::esp_chip_info_t::default();
        let mut flash_bytes = 0;
        let mut mac = [0u8; 6];
        // SAFETY: each call fills a caller-owned, correctly sized out-parameter.
        let psram = unsafe {
            sys::esp_chip_info(&raw mut chip);
            sys::esp_flash_get_size(core::ptr::null_mut(), &raw mut flash_bytes);
            sys::esp_read_mac(mac.as_mut_ptr(), sys::esp_mac_type_t_ESP_MAC_BASE);
            sys::heap_caps_get_total_size(sys::MALLOC_CAP_SPIRAM)
        };
        Identity {
            chip_revision: chip.revision,
            cores: chip.cores,
            flash_bytes,
            psram_bytes: u32::try_from(psram).unwrap_or(u32::MAX),
            mac,
        }
    }

    fn battery_mv(&mut self) -> Option<u32> {
        let mut sum = 0u32;
        for _ in 0..BATTERY_SAMPLES {
            sum += u32::from(self.battery.read().ok()?);
        }
        Some(sum / BATTERY_SAMPLES * self.divider_x1000 / 1000)
    }

    fn wake_cause(&mut self) -> WakeCause {
        // SAFETY: reads a status register, no arguments.
        #[allow(non_upper_case_globals)]
        match unsafe { sys::esp_sleep_get_wakeup_cause() } {
            sys::esp_sleep_source_t_ESP_SLEEP_WAKEUP_UNDEFINED => WakeCause::PowerOn,
            sys::esp_sleep_source_t_ESP_SLEEP_WAKEUP_EXT0 => WakeCause::Motion,
            _ => WakeCause::Other,
        }
    }

    fn arm_motion_wake(&mut self) -> Result<(), Error> {
        // SAFETY: configures ext0 on an RTC pad number from a HAL pin.
        sys::esp!(unsafe {
            sys::esp_sleep_enable_ext0_wakeup(sys::gpio_num_t::from(self.motion_wake), 1)
        })
        .map_err(|e| {
            log::error!("cannot arm ext0 wake: {e}");
            Error::Io
        })
    }

    fn last_sequence(&mut self) -> Result<Option<u32>, Error> {
        self.store.last_sequence()
    }

    fn store_sequence(&mut self, sequence: u32) -> Result<(), Error> {
        self.store.store_sequence(sequence)
    }

    fn store_identity(&mut self, device_id: &str, root_secret_hex: &str) -> Result<(), Error> {
        self.store.store_identity(device_id, root_secret_hex)
    }

    fn deep_sleep(&mut self) {
        hold::enable_during_deep_sleep();
        thread::sleep(SLEEP_FLUSH);
        // SAFETY: never returns; the chip resets on wake.
        unsafe { sys::esp_deep_sleep_start() }
    }
}
