//! Versioned, checksummed representation of one pending event in durable storage.

use guardian_core::error::{Error, Result};
use guardian_protocol::envelope::MAX_BODY;

use crate::outbox::PendingEvent;

const MAGIC: &[u8; 4] = b"GOBX";
const VERSION: u8 = 1;
const FLAG_DEFERRED_MOTION: u8 = 1;
const SEQUENCE_OFFSET: usize = MAGIC.len() + 2;
const GENERATION_OFFSET: usize = SEQUENCE_OFFSET + size_of::<u32>();
const BODY_LEN_OFFSET: usize = GENERATION_OFFSET + size_of::<u32>();
const HEADER_LEN: usize = BODY_LEN_OFFSET + size_of::<u16>();
const CHECKSUM_LEN: usize = size_of::<u32>();

/// Largest encoded pending-event record.
pub const MAX_PENDING_RECORD: usize = HEADER_LEN + MAX_BODY + CHECKSUM_LEN;

/// Fixed-capacity record ready for one durable blob write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingRecord {
    bytes: [u8; MAX_PENDING_RECORD],
    len: usize,
}

impl PendingRecord {
    /// Exact bytes to persist as one blob.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.len]
    }
}

/// Encode one pending event into the durable record format.
#[must_use]
pub fn encode_pending(event: &PendingEvent) -> PendingRecord {
    let body = event.as_bytes();
    let mut bytes = [0; MAX_PENDING_RECORD];
    bytes[..MAGIC.len()].copy_from_slice(MAGIC);
    bytes[MAGIC.len()] = VERSION;
    let motion_generation = event.deferred_motion_generation();
    bytes[5] = u8::from(motion_generation.is_some());
    bytes[SEQUENCE_OFFSET..GENERATION_OFFSET].copy_from_slice(&event.sequence().to_le_bytes());
    bytes[GENERATION_OFFSET..BODY_LEN_OFFSET]
        .copy_from_slice(&motion_generation.unwrap_or(0).to_le_bytes());
    let body_len = u16::try_from(body.len()).unwrap_or(u16::MAX);
    bytes[BODY_LEN_OFFSET..HEADER_LEN].copy_from_slice(&body_len.to_le_bytes());
    let body_end = HEADER_LEN + body.len();
    bytes[HEADER_LEN..body_end].copy_from_slice(body);
    let checksum = crc32(&bytes[..body_end]);
    bytes[body_end..body_end + CHECKSUM_LEN].copy_from_slice(&checksum.to_le_bytes());
    PendingRecord {
        bytes,
        len: body_end + CHECKSUM_LEN,
    }
}

/// Validate and restore one durable pending-event record.
///
/// # Errors
/// [`Error::State`] when the record is truncated, unsupported or corrupt.
pub fn decode_pending(record: &[u8]) -> Result<PendingEvent> {
    if record.len() < HEADER_LEN + CHECKSUM_LEN
        || &record[..MAGIC.len()] != MAGIC
        || record[MAGIC.len()] != VERSION
    {
        return Err(Error::State);
    }
    let flags = record[5];
    if flags & !FLAG_DEFERRED_MOTION != 0 {
        return Err(Error::State);
    }
    let sequence = u32::from_le_bytes(
        record[SEQUENCE_OFFSET..GENERATION_OFFSET]
            .try_into()
            .map_err(|_| Error::State)?,
    );
    let generation = u32::from_le_bytes(
        record[GENERATION_OFFSET..BODY_LEN_OFFSET]
            .try_into()
            .map_err(|_| Error::State)?,
    );
    let body_len = usize::from(u16::from_le_bytes(
        record[BODY_LEN_OFFSET..HEADER_LEN]
            .try_into()
            .map_err(|_| Error::State)?,
    ));
    let body_end = HEADER_LEN.checked_add(body_len).ok_or(Error::State)?;
    let record_end = body_end.checked_add(CHECKSUM_LEN).ok_or(Error::State)?;
    if body_len == 0 || body_len > MAX_BODY || record_end != record.len() {
        return Err(Error::State);
    }
    let expected = u32::from_le_bytes(
        record[body_end..record_end]
            .try_into()
            .map_err(|_| Error::State)?,
    );
    if crc32(&record[..body_end]) != expected {
        return Err(Error::State);
    }
    match (flags & FLAG_DEFERRED_MOTION != 0, generation) {
        (true, generation) if generation != 0 => PendingEvent::restore_deferred_motion(
            sequence,
            &record[HEADER_LEN..body_end],
            generation,
        ),
        (false, 0) => PendingEvent::restore(sequence, &record[HEADER_LEN..body_end]),
        _ => Err(Error::State),
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = u32::MAX;
    for &byte in bytes {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let polynomial = 0xedb8_8320 & 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ polynomial;
        }
    }
    !crc
}
