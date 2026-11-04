//! GPIO pad hold across deep sleep.
//!
//! `esp-idf-hal` has no safe wrapper for pad hold, so this module is the only
//! place where these ESP-IDF calls are made. All of them only touch `IO_MUX`
//! hold bits of a valid pad number; none dereference memory.

use esp_idf_svc::hal::gpio::PinId;
use esp_idf_svc::sys::{self, EspError};

/// Latch the current level of `pin` until [`release`] (survives deep sleep once
/// [`enable_during_deep_sleep`] is called).
///
/// # Errors
/// If ESP-IDF rejects the pad (not holdable on this chip).
pub fn hold(pin: PinId) -> Result<(), EspError> {
    // SAFETY: plain register write on a pad number obtained from a HAL pin.
    sys::esp!(unsafe { sys::gpio_hold_en(sys::gpio_num_t::from(pin)) })
}

/// Release a hold left by a previous boot, so the pin can be driven again.
pub fn release(pin: PinId) {
    // SAFETY: as in `hold`. Releasing a pad that is not held is a no-op.
    let _ = unsafe { sys::gpio_hold_dis(sys::gpio_num_t::from(pin)) };
}

/// Keep every held digital pad latched during deep sleep.
pub fn enable_during_deep_sleep() {
    // SAFETY: global flag in the RTC controller, no arguments.
    unsafe { sys::gpio_deep_sleep_hold_en() };
}

/// Undo [`enable_during_deep_sleep`] after waking.
pub fn disable_during_deep_sleep() {
    // SAFETY: as above.
    unsafe { sys::gpio_deep_sleep_hold_dis() };
}

/// Drive a pad low as plain GPIO, detaching any peripheral routed to it.
///
/// Used to park the modem UART TX line before sleep, after the UART is no
/// longer needed.
///
/// # Errors
/// If ESP-IDF rejects the pad.
pub fn park_low(pin: PinId) -> Result<(), EspError> {
    let gpio = sys::gpio_num_t::from(pin);
    // SAFETY: reconfigures one pad's mux/direction; the UART that used it is
    // never touched again before deep sleep resets the chip.
    unsafe {
        sys::esp!(sys::gpio_reset_pin(gpio))?;
        sys::esp!(sys::gpio_set_direction(
            gpio,
            sys::gpio_mode_t_GPIO_MODE_OUTPUT
        ))?;
        sys::esp!(sys::gpio_set_level(gpio, 0))
    }
}
