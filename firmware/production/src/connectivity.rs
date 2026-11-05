//! Shared modem ownership for clock synchronisation and exact event delivery.

use guardian_core::error::Result;
use guardian_core::ports::{Modem, Uplink};
use guardian_device::ports::{Clock, EventUplink};
use guardian_device::uplink::SignedEventUplink;
use guardian_esp32::modem::A7670;
use guardian_protocol::identity::{DeviceId, RootSecret};
use guardian_protocol::time::UtcTime;

/// Production networking facade around the single A7670 instance.
pub struct Connectivity {
    events: SignedEventUplink<A7670>,
}

impl Connectivity {
    /// Derive the event key while the root secret is still in scope.
    #[must_use]
    pub fn new(modem: A7670, device: DeviceId, root: &RootSecret) -> Self {
        Self {
            events: SignedEventUplink::new(modem, device, root),
        }
    }

    /// Power down, park and latch every modem line for deep sleep.
    ///
    /// # Errors
    /// A modem line could not be parked safely.
    pub fn shutdown_and_park(&mut self) -> Result<()> {
        let modem = self.events.inner_mut();
        modem.power_off();
        modem.park_for_sleep()
    }
}

impl Clock for Connectivity {
    fn now(&mut self) -> Result<UtcTime> {
        let modem = self.events.inner_mut();
        modem.power_on()?;
        modem.network_time()
    }

    fn heartbeat_due(&mut self, _now: UtcTime) -> Result<bool> {
        Ok(false)
    }
}

impl EventUplink for Connectivity {
    fn post_event(&mut self, body: &[u8]) -> Result<u16> {
        let modem = self.events.inner_mut();
        modem.power_on()?;
        // TLS verifies certificate dates, and this modem can retain a stale
        // plausible clock across power cycles. Every retry must resynchronise
        // before HTTPS even though the persisted event bytes stay unchanged.
        modem.network_time()?;
        self.events.post_event(body)
    }
}
