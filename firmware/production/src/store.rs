//! Strict, checksummed production state in the Guardian NVS namespace.

use esp_idf_svc::nvs::{EspDefaultNvsPartition, EspNvs, NvsDefault};
use esp_idf_svc::sys::EspError;
use guardian_core::error::{Error, Result};
use guardian_device::outbox::PendingEvent;
use guardian_device::ports::EventStore;
use guardian_device::record::{decode_pending, encode_pending, MAX_PENDING_RECORD};
use guardian_device::storage::{
    advance_motion_state, consume_motion_generation,
    deferred_motion_generation as decode_deferred_motion, NVS_DEVICE_ID_KEY, NVS_MOTION_KEY,
    NVS_NAMESPACE, NVS_PENDING_KEY, NVS_ROOT_SECRET_KEY, NVS_SEQUENCE_KEY,
};
use guardian_protocol::envelope::SEQUENCE_LIMIT;
use guardian_protocol::identity::{DeviceId, RootSecret, MAX_DEVICE_ID};
use zeroize::Zeroizing;

/// NVS-backed production state.
pub struct ProductionStore {
    nvs: EspNvs<NvsDefault>,
}

impl ProductionStore {
    /// Open or create the Guardian namespace.
    ///
    /// # Errors
    /// ESP-IDF could not open the default NVS partition.
    pub fn open(partition: EspDefaultNvsPartition) -> core::result::Result<Self, EspError> {
        Ok(Self {
            nvs: EspNvs::new(partition, NVS_NAMESPACE, true)?,
        })
    }

    /// Load and validate both provisioned identity fields. Missing, partial,
    /// malformed or unreadable identity fails closed.
    ///
    /// # Errors
    /// [`Error::State`] for missing/malformed data, [`Error::Io`] for NVS I/O.
    pub fn load_identity(&self) -> Result<(DeviceId, RootSecret)> {
        let id_len = self.nvs.str_len(NVS_DEVICE_ID_KEY).map_err(nvs_error)?;
        let secret_len = self.nvs.str_len(NVS_ROOT_SECRET_KEY).map_err(nvs_error)?;
        let (Some(id_len), Some(secret_len)) = (id_len, secret_len) else {
            return Err(Error::State);
        };
        if id_len == 0 || id_len > MAX_DEVICE_ID + 1 || secret_len != 65 {
            return Err(Error::State);
        }
        let mut id_buf = [0u8; MAX_DEVICE_ID + 1];
        let mut secret_buf = Zeroizing::new([0u8; 65]);
        let id = self
            .nvs
            .get_str(NVS_DEVICE_ID_KEY, &mut id_buf)
            .map_err(nvs_error)?
            .ok_or(Error::State)?;
        let secret = self
            .nvs
            .get_str(NVS_ROOT_SECRET_KEY, &mut secret_buf[..])
            .map_err(nvs_error)?
            .ok_or(Error::State)?;
        Ok((
            DeviceId::new(id).map_err(|_| Error::State)?,
            RootSecret::from_hex(secret).map_err(|_| Error::State)?,
        ))
    }
}

impl EventStore for ProductionStore {
    fn load_pending(&mut self) -> Result<Option<PendingEvent>> {
        let Some(len) = self.nvs.blob_len(NVS_PENDING_KEY).map_err(nvs_error)? else {
            return Ok(None);
        };
        if len == 0 || len > MAX_PENDING_RECORD {
            return Err(Error::State);
        }
        let mut bytes = [0u8; MAX_PENDING_RECORD];
        let record = self
            .nvs
            .get_blob(NVS_PENDING_KEY, &mut bytes[..len])
            .map_err(nvs_error)?
            .ok_or(Error::State)?;
        decode_pending(record).map(Some)
    }

    fn save_pending(&mut self, event: &PendingEvent) -> Result<()> {
        if self
            .nvs
            .blob_len(NVS_PENDING_KEY)
            .map_err(nvs_error)?
            .is_some()
        {
            return Err(Error::State);
        }
        let record = encode_pending(event);
        self.nvs
            .set_blob(NVS_PENDING_KEY, record.as_bytes())
            .map_err(nvs_error)
    }

    fn last_sequence(&mut self) -> Result<Option<u32>> {
        let sequence = self.nvs.get_u32(NVS_SEQUENCE_KEY).map_err(nvs_error)?;
        if sequence.is_some_and(|value| value == 0 || value >= SEQUENCE_LIMIT) {
            return Err(Error::State);
        }
        Ok(sequence)
    }

    fn commit_sequence(&mut self, sequence: u32) -> Result<()> {
        if sequence == 0 || sequence >= SEQUENCE_LIMIT {
            return Err(Error::State);
        }
        if let Some(last) = self.last_sequence()? {
            if sequence < last {
                return Err(Error::State);
            }
            if sequence == last {
                return Ok(());
            }
        }
        self.nvs
            .set_u32(NVS_SEQUENCE_KEY, sequence)
            .map_err(nvs_error)
    }

    fn clear_pending(&mut self) -> Result<()> {
        self.nvs
            .remove(NVS_PENDING_KEY)
            .map(|_| ())
            .map_err(nvs_error)
    }

    fn defer_motion(&mut self) -> Result<u32> {
        let current = self.nvs.get_u64(NVS_MOTION_KEY).map_err(nvs_error)?;
        let (state, generation) = advance_motion_state(current)?;
        self.nvs.set_u64(NVS_MOTION_KEY, state).map_err(nvs_error)?;
        Ok(generation)
    }

    fn deferred_motion_generation(&mut self) -> Result<Option<u32>> {
        let state = self.nvs.get_u64(NVS_MOTION_KEY).map_err(nvs_error)?;
        decode_deferred_motion(state)
    }

    fn clear_deferred_motion(&mut self, generation: u32) -> Result<()> {
        let current = self.nvs.get_u64(NVS_MOTION_KEY).map_err(nvs_error)?;
        let consumed = consume_motion_generation(current, generation)?;
        if current == Some(consumed) {
            return Ok(());
        }
        self.nvs
            .set_u64(NVS_MOTION_KEY, consumed)
            .map_err(nvs_error)
    }
}

fn nvs_error(error: EspError) -> Error {
    log::error!("NVS operation failed: {error}");
    Error::Io
}
