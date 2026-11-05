//! Step 7: the first signed event, sent over LTE.

use core::fmt::Write;

use guardian_protocol::envelope::{encode_event, Kind, Power, PowerSource};
use guardian_protocol::identity::{ChannelKey, Context, DeviceId, RootSecret};
use guardian_protocol::time::UtcTime;

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
    /// Sign a `heartbeat` and `POST` it to the backend.
    ///
    /// Bench simplification: the sequence is the UTC time in seconds, which
    /// only grows and needs no persistent counter (valid until 2038, the
    /// backend's `2^31` limit). Production keeps the counter in NVS. The
    /// device runs on its reserve battery here, so `vehicleMv` is 0.
    ///
    /// # Errors
    /// No identity, modem or network time unavailable, an invalid value for
    /// the contract, no HTTP exchange, or a status other than 202.
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
        let sequence =
            sequence_for(now).inspect_err(|_| say!(self, "clock out of range: {now}"))?;
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

/// Seconds since 1970 as the bench sequence.
fn sequence_for(now: UtcTime) -> Result<u32> {
    u32::try_from(now.unix())
        .ok()
        .filter(|&s| s > 0 && s < guardian_protocol::envelope::SEQUENCE_LIMIT)
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
