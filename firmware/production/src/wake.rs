//! ESP32 wake-source programming and deep sleep.

use std::thread;
use std::time::Duration;

use esp_idf_svc::hal::gpio::PinId;
use esp_idf_svc::sys;
use guardian_core::error::{Error, Result};
use guardian_core::ports::WakeCause;
use guardian_device::ports::WakeTimer;
use guardian_esp32::hold;

const LOG_FLUSH: Duration = Duration::from_millis(200);

/// Read why this boot started.
#[must_use]
pub fn wake_cause() -> WakeCause {
    // SAFETY: reads one RTC status register and takes no pointers.
    #[allow(non_upper_case_globals)]
    match unsafe { sys::esp_sleep_get_wakeup_cause() } {
        sys::esp_sleep_source_t_ESP_SLEEP_WAKEUP_UNDEFINED => WakeCause::PowerOn,
        sys::esp_sleep_source_t_ESP_SLEEP_WAKEUP_EXT0 => WakeCause::Motion,
        _ => WakeCause::Other,
    }
}

/// Restart immediately so a newly deferred event is processed from a clean
/// composition root (including release of modem pad holds).
pub fn restart_now() -> ! {
    // SAFETY: deliberate whole-chip restart; ESP-IDF marks this no-return.
    unsafe { sys::esp_restart() }
}

/// Motion ext0 plus bounded periodic timer wake.
pub struct Esp32WakeTimer {
    motion: PinId,
}

impl Esp32WakeTimer {
    /// Use this RTC-capable pad as the active-HIGH motion source.
    #[must_use]
    pub const fn new(motion: PinId) -> Self {
        Self { motion }
    }
}

impl WakeTimer for Esp32WakeTimer {
    fn arm_after(&mut self, seconds: u32) -> Result<()> {
        if seconds == 0 {
            return Err(Error::State);
        }
        let micros = u64::from(seconds)
            .checked_mul(1_000_000)
            .ok_or(Error::State)?;
        // SAFETY: configures RTC wake hardware from a valid HAL pad and a
        // checked non-zero duration; no memory is dereferenced.
        sys::esp!(unsafe {
            sys::esp_sleep_enable_ext0_wakeup(sys::gpio_num_t::from(self.motion), 1)
        })
        .map_err(|_| Error::Io)?;
        // SAFETY: duration value only, with no pointer arguments.
        sys::esp!(unsafe { sys::esp_sleep_enable_timer_wakeup(micros) }).map_err(|_| Error::Io)
    }

    fn sleep(&mut self) -> Result<()> {
        hold::enable_during_deep_sleep();
        thread::sleep(LOG_FLUSH);
        // SAFETY: ESP-IDF enters deep sleep and the chip resets on wake.
        unsafe { sys::esp_deep_sleep_start() }
    }
}
