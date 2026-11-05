//! Capture of one awaited item in the modem's output: a response line
//! (`+CCLK: ...`), a prompt (`DOWNLOAD`, `>`) or an unsolicited result
//! (`+HTTPACTION: ...`). One capture at a time: commands are serialised by
//! `&mut` on the modem.

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

/// What to wait for.
#[derive(Debug, Clone, Copy)]
pub enum Prompt {
    /// The next line starting with this prefix (`DOWNLOAD` for
    /// `AT+HTTPDATA`, `+CCLK:` for a query).
    Line(&'static str),
    /// This byte anywhere in the raw stream. A prompt such as `>`
    /// (`AT+CCERTDOWN`) arrives without CR/LF, so it never becomes a line.
    Byte(u8),
}

#[derive(Default)]
struct Slot {
    target: Option<Prompt>,
    seen: Option<String>,
}

/// Shared between the reader thread (offers) and the command caller (waits).
#[derive(Default)]
pub struct Capture {
    slot: Mutex<Slot>,
    seen: Condvar,
}

impl Capture {
    /// Start waiting for `target`, discarding any previous capture. Arm
    /// before sending the command, so a fast answer is not missed.
    pub fn arm(&self, target: Prompt) {
        *self.lock() = Slot {
            target: Some(target),
            seen: None,
        };
    }

    /// Reader side: a raw chunk, before line framing.
    pub fn offer_chunk(&self, chunk: &[u8]) {
        let mut slot = self.lock();
        if let (Some(Prompt::Byte(byte)), None) = (slot.target, &slot.seen) {
            if chunk.contains(&byte) {
                slot.seen = Some(char::from(byte).to_string());
                self.seen.notify_all();
            }
        }
    }

    /// Reader side: a complete line.
    pub fn offer_line(&self, line: &str) {
        let mut slot = self.lock();
        if let (Some(Prompt::Line(prefix)), None) = (slot.target, &slot.seen) {
            if line.starts_with(prefix) {
                slot.seen = Some(line.to_owned());
                self.seen.notify_all();
            }
        }
    }

    /// Wait up to `wait` for the armed target, then disarm.
    pub fn take(&self, wait: Duration) -> Option<String> {
        let (mut slot, _) = self
            .seen
            .wait_timeout_while(self.lock(), wait, |s| s.seen.is_none())
            .unwrap_or_else(PoisonError::into_inner);
        slot.target = None;
        slot.seen.take()
    }

    fn lock(&self) -> MutexGuard<'_, Slot> {
        self.slot.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
