//! Persistent device state in the shared Guardian NVS namespace: the event
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
use guardian_device::storage::{
    deferred_motion_generation, NVS_DEVICE_ID_KEY, NVS_MOTION_KEY, NVS_NAMESPACE, NVS_PENDING_KEY,
    NVS_ROOT_SECRET_KEY, NVS_SEQUENCE_KEY,
};
use guardian_protocol::identity::{DeviceId, RootSecret, MAX_DEVICE_ID};
use guardian_protocol::ProtocolError;
use zeroize::Zeroizing;

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
            nvs: EspNvs::new(partition, NVS_NAMESPACE, true)?,
        })
    }

    /// The provisioned identity, if any; `Err` if stored but invalid.
    pub fn identity(&self) -> Option<Result<DeviceIdentity, ProtocolError>> {
        let mut id_buf = [0u8; MAX_DEVICE_ID + 1];
        let mut secret_buf = Zeroizing::new([0u8; 65]);
        let id = self.nvs.get_str(NVS_DEVICE_ID_KEY, &mut id_buf).ok()??;
        let secret = self
            .nvs
            .get_str(NVS_ROOT_SECRET_KEY, &mut secret_buf[..])
            .ok()??;
        Some(DeviceId::new(id).and_then(|device| {
            RootSecret::from_hex(secret).map(|root| DeviceIdentity::new(device, &root))
        }))
    }

    /// Last stored sequence.
    ///
    /// # Errors
    /// [`Error::Io`] if NVS cannot be read, [`Error::State`] while production
    /// owns a pending outbox/motion observation.
    pub fn last_sequence(&self) -> Result<Option<u32>, Error> {
        if self.production_state_present()? {
            log::warn!("bench event refused: production outbox or motion is pending");
            return Err(Error::State);
        }
        self.nvs.get_u32(NVS_SEQUENCE_KEY).map_err(|e| {
            log::error!("NVS read of sequence failed: {e}");
            Error::Io
        })
    }

    /// Store and commit `sequence`.
    ///
    /// # Errors
    /// [`Error::Io`] if the write or commit fails.
    pub fn store_sequence(&self, sequence: u32) -> Result<(), Error> {
        self.nvs.set_u32(NVS_SEQUENCE_KEY, sequence).map_err(|e| {
            log::error!("NVS write of sequence failed: {e}");
            Error::Io
        })
    }

    /// Store an identity. The sequence is dropped only when the device id
    /// changes: re-provisioning the same device keeps counting, so it can
    /// never go back below a sequence it already used.
    ///
    /// NVS has no transactions. If any write fails, both identity keys are
    /// erased, so the device reports "no identity" instead of booting with a
    /// new id and an old secret (every event would get 401).
    ///
    /// # Errors
    /// [`Error::Io`] if any read/write fails, [`Error::State`] if changing
    /// identity would orphan production state (the secret is never logged).
    pub fn store_identity(&self, device_id: &str, root_secret_hex: &str) -> Result<(), Error> {
        let mut id_buf = [0u8; MAX_DEVICE_ID + 1];
        let mut secret_buf = Zeroizing::new([0u8; 65]);
        let stored_id = self
            .nvs
            .get_str(NVS_DEVICE_ID_KEY, &mut id_buf)
            .map_err(read_error)?;
        let stored_secret = self
            .nvs
            .get_str(NVS_ROOT_SECRET_KEY, &mut secret_buf[..])
            .map_err(read_error)?;
        let same_device = stored_id == Some(device_id);
        let same_identity = same_device && stored_secret == Some(root_secret_hex);
        if same_identity {
            return Ok(());
        }
        if self.production_state_present()? {
            log::warn!("reprovision refused: production outbox or motion is pending");
            return Err(Error::State);
        }
        let result = (if same_device {
            Ok(true)
        } else {
            self.nvs
                .remove(NVS_SEQUENCE_KEY)
                .and_then(|_| self.nvs.remove(NVS_MOTION_KEY))
        })
        .and_then(|_| self.nvs.set_str(NVS_DEVICE_ID_KEY, device_id))
        .and_then(|()| self.nvs.set_str(NVS_ROOT_SECRET_KEY, root_secret_hex));
        result.map_err(|e| {
            log::error!("NVS write of identity failed, erasing it: {e}");
            let _ = self.nvs.remove(NVS_DEVICE_ID_KEY);
            let _ = self.nvs.remove(NVS_ROOT_SECRET_KEY);
            Error::Io
        })
    }

    fn production_state_present(&self) -> Result<bool, Error> {
        let pending = self.nvs.blob_len(NVS_PENDING_KEY).map_err(read_error)?;
        let motion = self.nvs.get_u64(NVS_MOTION_KEY).map_err(read_error)?;
        let motion_pending = deferred_motion_generation(motion)?;
        Ok(pending.is_some() || motion_pending.is_some())
    }
}

fn read_error(error: EspError) -> Error {
    log::error!("NVS read failed: {error}");
    Error::Io
}
