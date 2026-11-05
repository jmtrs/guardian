//! Device identity and keys.
//!
//! `K_context = HKDF-SHA256(ikm = K_root, salt = deviceId, info =
//! "guardian/<context>/v1")`, one key per channel, never reused across them.
//! A signature is HMAC-SHA256 over the exact body bytes, sent as 64 lowercase
//! hex digits in `X-Guardian-Signature`.

use core::fmt;

use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::ProtocolError;

/// Longest device id accepted (backend ids are 25-character cuids).
pub const MAX_DEVICE_ID: usize = 40;

/// A device id, restricted to `[A-Za-z0-9_-]` so it can be written into JSON
/// and HTTP headers without escaping.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct DeviceId {
    bytes: [u8; MAX_DEVICE_ID],
    len: usize,
}

impl DeviceId {
    /// Validate and copy `id`.
    ///
    /// # Errors
    /// [`ProtocolError::DeviceId`] if empty, too long or with other characters.
    pub fn new(id: &str) -> Result<Self, ProtocolError> {
        let valid = |b: u8| b.is_ascii_alphanumeric() || b == b'-' || b == b'_';
        if id.is_empty() || id.len() > MAX_DEVICE_ID || !id.bytes().all(valid) {
            return Err(ProtocolError::DeviceId);
        }
        let mut bytes = [0; MAX_DEVICE_ID];
        bytes[..id.len()].copy_from_slice(id.as_bytes());
        Ok(Self {
            bytes,
            len: id.len(),
        })
    }

    /// The id as text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        // Only ASCII is ever stored (checked in `new`).
        core::str::from_utf8(&self.bytes[..self.len]).unwrap_or("")
    }
}

impl fmt::Display for DeviceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl fmt::Debug for DeviceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "DeviceId({})", self.as_str())
    }
}

/// The device's root secret `K_root` (32 bytes). Never printed: its `Debug`
/// is redacted.
#[derive(Clone)]
pub struct RootSecret([u8; 32]);

impl RootSecret {
    /// Parse 64 hex digits, as printed at provisioning.
    ///
    /// # Errors
    /// [`ProtocolError::Secret`] on wrong length or a non-hex digit.
    pub fn from_hex(hex: &str) -> Result<Self, ProtocolError> {
        let digits = hex.as_bytes();
        if digits.len() != 64 {
            return Err(ProtocolError::Secret);
        }
        let mut key = [0; 32];
        for (byte, pair) in key.iter_mut().zip(digits.chunks_exact(2)) {
            let high = hex_value(pair[0]).ok_or(ProtocolError::Secret)?;
            let low = hex_value(pair[1]).ok_or(ProtocolError::Secret)?;
            *byte = high << 4 | low;
        }
        Ok(Self(key))
    }

    /// Derive the key of one channel for `device`.
    #[must_use]
    pub fn derive(&self, device: &DeviceId, context: Context) -> ChannelKey {
        let mut key = [0; 32];
        // 32 bytes is far below HKDF-SHA256's 8160-byte limit: cannot fail.
        let _ = Hkdf::<Sha256>::new(Some(device.as_str().as_bytes()), &self.0)
            .expand(context.info(), &mut key);
        ChannelKey(key)
    }
}

impl fmt::Debug for RootSecret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("RootSecret(<redacted>)")
    }
}

/// Channels with their own key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Context {
    /// Events (`POST /v1/events`).
    Event,
    /// Command polling (`POST /v1/commands/poll`).
    Command,
    /// Bluetooth pairing challenge.
    Ble,
}

impl Context {
    fn info(self) -> &'static [u8] {
        match self {
            Self::Event => b"guardian/event/v1",
            Self::Command => b"guardian/command/v1",
            Self::Ble => b"guardian/ble/v1",
        }
    }
}

/// A per-channel key. `Debug` is redacted.
#[derive(Clone)]
pub struct ChannelKey([u8; 32]);

impl ChannelKey {
    /// HMAC-SHA256 of `body`.
    #[must_use]
    pub fn sign(&self, body: &[u8]) -> Signature {
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&self.0)
            .unwrap_or_else(|_| unreachable!("HMAC accepts keys of any length"));
        mac.update(body);
        Signature(mac.finalize().into_bytes().into())
    }

    /// Raw key bytes, for cross-checking against the reference in tests.
    #[must_use]
    pub fn expose(&self) -> &[u8; 32] {
        &self.0
    }
}

impl fmt::Debug for ChannelKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ChannelKey(<redacted>)")
    }
}

/// An HMAC-SHA256 tag. `Display` is the 64 lowercase hex digits the backend
/// expects.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Signature([u8; 32]);

impl fmt::Display for Signature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.iter().try_for_each(|b| write!(f, "{b:02x}"))
    }
}

fn hex_value(digit: u8) -> Option<u8> {
    match digit {
        b'0'..=b'9' => Some(digit - b'0'),
        b'a'..=b'f' => Some(digit - b'a' + 10),
        b'A'..=b'F' => Some(digit - b'A' + 10),
        _ => None,
    }
}
