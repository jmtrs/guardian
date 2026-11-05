//! Exact-byte event authentication over the shared modem transport.

use guardian_core::error::Result;
use guardian_core::ports::{DeviceRequest, Uplink};
use guardian_protocol::identity::{ChannelKey, Context, DeviceId, RootSecret};

use crate::ports::EventUplink;

/// Backend path for device events.
pub const EVENTS_PATH: &str = "/v1/events";

/// Event uplink that derives one channel key and signs the supplied bytes.
pub struct SignedEventUplink<U> {
    inner: U,
    device: DeviceId,
    event_key: ChannelKey,
}

impl<U> SignedEventUplink<U> {
    /// Derive `K_event`; the caller can drop the root secret immediately.
    #[must_use]
    pub fn new(inner: U, device: DeviceId, root: &RootSecret) -> Self {
        Self {
            inner,
            device,
            event_key: root.derive(&device, Context::Event),
        }
    }

    /// Validated id used in both event bodies and request headers.
    #[must_use]
    pub const fn device(&self) -> DeviceId {
        self.device
    }

    /// Borrow the underlying modem transport.
    pub fn inner_mut(&mut self) -> &mut U {
        &mut self.inner
    }

    /// Release the underlying modem transport.
    #[must_use]
    pub fn into_inner(self) -> U {
        self.inner
    }
}

impl<U: Uplink> EventUplink for SignedEventUplink<U> {
    fn post_event(&mut self, body: &[u8]) -> Result<u16> {
        let signature = self.event_key.sign(body).hex();
        self.inner.post(&DeviceRequest {
            path: EVENTS_PATH,
            device_id: self.device.as_str(),
            signature: signature.as_str(),
            body,
        })
    }
}
