//! Persistent device state in NVS (namespace [`NAMESPACE`]): the event
//! sequence and the provisioned identity. Every write is committed before it
//! returns (`EspNvs::set_*`).
//!
//! The NVS partition is not encrypted yet: the root secret sits in plain
//! flash. Production needs flash + NVS encryption (with secure boot) before
//! devices leave the bench.

use esp_idf_svc::nvs::{EspDefaultNvsPartition, EspNvs, NvsDefault};
use esp_idf_svc::sys::EspError;
use guardian_core::bringup::DeviceIdentity;
use guardian_core::Error;
use guardian_protocol::identity::{DeviceId, RootSecret, MAX_DEVICE_ID};
use guardian_protocol::ProtocolError;

/// NVS namespace of the Guardian firmware.
pub const NAMESPACE: &str = "guardian";
const KEY_SEQUENCE: &str = "seq";
const KEY_DEVICE_ID: &str = "device_id";
const KEY_ROOT_SECRET: &str = "root_secret";

/// Device state store.
pub struct Store {
    nvs: EspNvs<NvsDefault>,
}

impl Store {
    /// Open (creating if needed) the Guardian namespace.
    ///
    /// # Errors
    /// If the NVS partition cannot be opened.
    pub fn open(partition: EspDefaultNvsPartition) -> Result<Self, EspError> {
        Ok(Self {
            nvs: EspNvs::new(partition, NAMESPACE, true)?,
        })
    }

    /// The provisioned identity, if any; `Err` if stored but invalid.
    pub fn identity(&self) -> Option<Result<DeviceIdentity, ProtocolError>> {
        let mut id_buf = [0u8; MAX_DEVICE_ID + 1];
        let mut secret_buf = [0u8; 65];
        let id = self.nvs.get_str(KEY_DEVICE_ID, &mut id_buf).ok()??;
        let secret = self.nvs.get_str(KEY_ROOT_SECRET, &mut secret_buf).ok()??;
        Some(DeviceId::new(id).and_then(|device| {
            RootSecret::from_hex(secret).map(|root| DeviceIdentity::new(device, &root))
        }))
    }

    /// Last stored sequence.
    ///
    /// # Errors
    /// [`Error::Io`] if NVS cannot be read.
    pub fn last_sequence(&self) -> Result<Option<u32>, Error> {
        self.nvs.get_u32(KEY_SEQUENCE).map_err(|e| {
            log::error!("NVS read of sequence failed: {e}");
            Error::Io
        })
    }

    /// Store and commit `sequence`.
    ///
    /// # Errors
    /// [`Error::Io`] if the write or commit fails.
    pub fn store_sequence(&self, sequence: u32) -> Result<(), Error> {
        self.nvs.set_u32(KEY_SEQUENCE, sequence).map_err(|e| {
            log::error!("NVS write of sequence failed: {e}");
            Error::Io
        })
    }

    /// Store a new identity and drop the previous identity's sequence.
    ///
    /// # Errors
    /// [`Error::Io`] if any write fails (the secret is never logged).
    pub fn store_identity(&self, device_id: &str, root_secret_hex: &str) -> Result<(), Error> {
        let result = self
            .nvs
            .remove(KEY_SEQUENCE)
            .and_then(|_| self.nvs.set_str(KEY_DEVICE_ID, device_id))
            .and_then(|()| self.nvs.set_str(KEY_ROOT_SECRET, root_secret_hex));
        result.map_err(|e| {
            log::error!("NVS write of identity failed: {e}");
            Error::Io
        })
    }
}
