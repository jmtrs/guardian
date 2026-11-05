//! Step 7: the first signed event, sent over LTE.

use core::fmt::Write;

use guardian_protocol::envelope::{encode_event, Kind, Power, PowerSource};
use guardian_protocol::identity::{ChannelKey, Context, DeviceId, RootSecret};

use super::{say, Bringup};
use crate::error::{Error, Result};
use crate::ports::{DeviceRequest, Modem, MotionSensor, Platform, Uplink};

/// Path of the event endpoint.
const EVENTS_PATH: &str = "/v1/events";
/// Status the backend returns for an accepted event.
const ACCEPTED: u16 = 202;

/// Who the device is: its id and the event key derived from `K_root`. The root
/// secret itself is not kept.
#[derive(Debug, Clone)]
pub struct DeviceIdentity {
    device: DeviceId,
    event_key: ChannelKey,
}

impl DeviceIdentity {
    /// Derive the event key for `device` from its root secret.
    #[must_use]
    pub fn new(device: DeviceId, root: &RootSecret) -> Self {
        Self {
            event_key: root.derive(&device, Context::Event),
            device,
        }
    }
}

impl<M: Modem + Uplink, S: MotionSensor, P: Platform, W: Write> Bringup<M, S, P, W> {
    /// Store a validated identity (factory provisioning) and use it from now
    /// on. The secret is never printed.
    ///
    /// # Errors
    /// [`Error::State`] for an invalid id or secret, storage errors.
    pub fn provision(&mut self, device_id: &str, secret_hex: &str) -> Result<()> {
        let (Ok(device), Ok(root)) = (DeviceId::new(device_id), RootSecret::from_hex(secret_hex))
        else {
            say!(
                self,
                "provision refused: id must be [A-Za-z0-9_-], secret 64 hex digits"
            );
            return Err(Error::State);
        };
        self.platform
            .store_identity(device_id, secret_hex)
            .inspect_err(|e| say!(self, "identity not stored: {e}"))?;
        self.identity = Some(DeviceIdentity::new(device, &root));
        say!(self, "identity stored for device {device_id}");
        Ok(())
    }

    /// Sign a `heartbeat` and `POST` it to the backend.
    ///
    /// The sequence is persisted before the event leaves (see
    /// [`next_sequence`]). The device runs on its reserve battery here, so
    /// `vehicleMv` is 0.
    ///
    /// # Errors
    /// No identity, modem, network time or sequence storage unavailable, an
    /// invalid value for the contract, no HTTP exchange, or a status other
    /// than 202.
    pub fn send_heartbeat(&mut self) -> Result<u16> {
        let Some(identity) = self.identity.clone() else {
            say!(
                self,
                "no device identity: build with GUARDIAN_DEVICE_ID and GUARDIAN_DEVICE_SECRET_HEX"
            );
            return Err(Error::State);
        };
        self.modem_on()?;
        let now = self
            .modem
            .network_time()
            .inspect_err(|e| say!(self, "network time unavailable: {e}"))?;
        let sequence = self.reserve_sequence()?;
        let reserve = self
            .platform
            .battery_mv()
            .and_then(|mv| u16::try_from(mv).ok());
        let body = Power::new(0, reserve, PowerSource::Reserve)
            .and_then(|power| encode_event(&identity.device, sequence, Kind::Heartbeat, now, power))
            .map_err(|e| {
                say!(self, "event not encodable: {e}");
                Error::State
            })?;
        let signature = identity.event_key.sign(body.as_bytes()).hex();
        say!(
            self,
            "heartbeat seq {sequence} at {now}, {} bytes, signed",
            body.as_bytes().len()
        );
        let status = self
            .modem
            .post(&DeviceRequest {
                path: EVENTS_PATH,
                device_id: identity.device.as_str(),
                signature: signature.as_str(),
                body: body.as_bytes(),
            })
            .inspect_err(|e| say!(self, "no HTTP exchange: {e}"))?;
        say!(self, "backend: HTTP {status} ({})", meaning(status));
        if status == ACCEPTED {
            Ok(status)
        } else {
            Err(Error::Rejected)
        }
    }
}

impl<M: Modem + Uplink, S: MotionSensor, P: Platform, W: Write> Bringup<M, S, P, W> {
    /// Pick the next sequence and record it durably before it is used.
    fn reserve_sequence(&mut self) -> Result<u32> {
        let last = self
            .platform
            .last_sequence()
            .inspect_err(|e| say!(self, "sequence storage unreadable: {e}"))?;
        let next = next_sequence(last).inspect_err(|_| say!(self, "sequence exhausted"))?;
        self.platform
            .store_sequence(next)
            .inspect_err(|e| say!(self, "sequence not stored, not sending: {e}"))?;
        Ok(next)
    }
}

/// One above the last recorded sequence. A new identity starts at one; time is
/// deliberately excluded from the anti-replay counter.
///
/// # Errors
/// [`Error::State`] once the limit is reached.
pub fn next_sequence(last: Option<u32>) -> Result<u32> {
    let next = match last {
        Some(last) => last.checked_add(1),
        None => Some(1),
    };
    next.filter(|&s| s > 0 && s < guardian_protocol::envelope::SEQUENCE_LIMIT)
        .ok_or(Error::State)
}

/// Operator hint for the statuses the event endpoint returns.
fn meaning(status: u16) -> &'static str {
    match status {
        202 => "accepted",
        400 => "envelope rejected",
        401 => "signature or device unknown",
        403 => "blocked before the backend (proxy)",
        409 => "replayed or stale sequence",
        _ => "unexpected",
    }
}
