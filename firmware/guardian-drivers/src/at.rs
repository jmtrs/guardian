//! AT protocol helpers: byte-stream line framing, final result codes and
//! result-to-command correlation ([`ResultGate`]).

/// Longest line kept; longer lines are split (and flagged by the caller's sink).
pub const MAX_LINE: usize = 512;

/// Final result code that ends an AT command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FinalResult {
    /// `OK`.
    Ok,
    /// `ERROR`, `+CME ERROR: n` or `+CMS ERROR: n`.
    Error,
}

/// Classify a line as a final result code, if it is one.
#[must_use]
pub fn final_result(line: &str) -> Option<FinalResult> {
    match line {
        "OK" => Some(FinalResult::Ok),
        "ERROR" => Some(FinalResult::Error),
        _ if line.starts_with("+CME ERROR") || line.starts_with("+CMS ERROR") => {
            Some(FinalResult::Error)
        }
        _ => None,
    }
}

/// Frames a UART byte stream into lines: LF ends a line, CR is dropped, blank
/// lines are skipped, and a line reaching [`MAX_LINE`] bytes is emitted early
/// without losing the byte that overflowed it.
pub struct LineFramer {
    buffer: [u8; MAX_LINE],
    length: usize,
}

impl Default for LineFramer {
    fn default() -> Self {
        Self {
            buffer: [0; MAX_LINE],
            length: 0,
        }
    }
}

impl LineFramer {
    /// Feed received bytes; `on_line` is called for every complete line.
    /// Invalid UTF-8 is replaced lossily byte by byte (`?`).
    pub fn push(&mut self, bytes: &[u8], mut on_line: impl FnMut(&str)) {
        for &byte in bytes {
            match byte {
                b'\r' => {}
                b'\n' => self.flush(&mut on_line),
                _ => {
                    if self.length == MAX_LINE {
                        self.flush(&mut on_line);
                    }
                    self.buffer[self.length] = if byte.is_ascii() { byte } else { b'?' };
                    self.length += 1;
                }
            }
        }
    }

    fn flush(&mut self, on_line: &mut impl FnMut(&str)) {
        if self.length > 0 {
            // Only ASCII is stored, so this never fails.
            if let Ok(line) = core::str::from_utf8(&self.buffer[..self.length]) {
                on_line(line);
            }
        }
        self.length = 0;
    }
}

/// Correlates final result codes with the command waiting for them.
///
/// AT has no correlation ids, and a command can time out while its result is
/// still in flight. The gate counts such *pending* results (timed-out
/// commands, fire-and-forget passthrough lines) and drops that many results
/// before accepting one for the next command. The caller waits for
/// [`is_settled`](Self::is_settled) before [`begin`](Self::begin), bounding the
/// wait and calling [`force_settle`](Self::force_settle) if a result never comes.
///
/// Known imprecision: an *unsolicited* final code (a bare `ERROR` the modem
/// emits on its own) arriving while results are owed is counted as one of
/// them, so the late result it stood for may later be taken by a waiting
/// command. `SIMCom` modems do not emit bare final codes unsolicited in normal
/// operation; the production firmware should prefer verbose, self-describing
/// responses over bare result codes where it matters.
#[derive(Debug, Default)]
pub struct ResultGate {
    awaiting: bool,
    result: Option<FinalResult>,
    pending: u32,
}

impl ResultGate {
    /// No result owed by an earlier command is still in flight.
    #[must_use]
    pub fn is_settled(&self) -> bool {
        self.pending == 0
    }

    /// Give up on in-flight results (they are presumed lost).
    pub fn force_settle(&mut self) {
        self.pending = 0;
    }

    /// Start waiting for the result of a command about to be sent.
    pub fn begin(&mut self) {
        self.awaiting = true;
        self.result = None;
    }

    /// A line was sent without waiting: its result will arrive unclaimed.
    pub fn expect_unclaimed(&mut self) {
        self.pending += 1;
    }

    /// Feed a final result read from the modem. Returns `true` if it completed
    /// the waiting command (the caller should then wake the waiter).
    pub fn offer(&mut self, result: FinalResult) -> bool {
        if self.pending > 0 {
            self.pending -= 1; // belongs to an earlier command
            return false;
        }
        if self.awaiting && self.result.is_none() {
            self.result = Some(result);
            return true;
        }
        false // unsolicited
    }

    /// Whether the waiting command already has its result.
    #[must_use]
    pub fn has_result(&self) -> bool {
        self.result.is_some()
    }

    /// Stop waiting. `None` means timeout: its result is now owed (pending).
    pub fn finish(&mut self) -> Option<FinalResult> {
        self.awaiting = false;
        let result = self.result.take();
        if result.is_none() {
            self.pending += 1;
        }
        result
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use std::string::{String, ToString};
    use std::vec::Vec;

    fn frame(chunks: &[&[u8]]) -> Vec<String> {
        let mut framer = LineFramer::default();
        let mut lines = Vec::new();
        for chunk in chunks {
            framer.push(chunk, |l| lines.push(l.to_string()));
        }
        lines
    }

    #[test]
    fn splits_crlf_lines_across_chunks() {
        assert_eq!(
            frame(&[b"\r\nOK\r", b"\n+CSQ: 2", b"0,99\r\n"]),
            ["OK", "+CSQ: 20,99"]
        );
    }

    #[test]
    fn skips_blank_lines_and_replaces_non_ascii() {
        assert_eq!(frame(&[b"\r\n\r\nA\xffB\n"]), ["A?B"]);
    }

    #[test]
    fn overlong_line_keeps_every_byte() {
        let mut long = [b'x'; MAX_LINE + 3].to_vec();
        long.push(b'\n');
        let lines = frame(&[&long]);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len() + lines[1].len(), MAX_LINE + 3);
    }

    #[test]
    fn classifies_final_results() {
        assert_eq!(final_result("OK"), Some(FinalResult::Ok));
        assert_eq!(final_result("ERROR"), Some(FinalResult::Error));
        assert_eq!(final_result("+CME ERROR: 10"), Some(FinalResult::Error));
        assert_eq!(final_result("+CMS ERROR: 500"), Some(FinalResult::Error));
        assert_eq!(final_result("+CSQ: 20,99"), None);
        assert_eq!(final_result("OKAY"), None);
    }

    #[test]
    fn gate_accepts_result_of_waiting_command() {
        let mut gate = ResultGate::default();
        gate.begin();
        assert!(gate.offer(FinalResult::Ok));
        assert_eq!(gate.finish(), Some(FinalResult::Ok));
        assert!(gate.is_settled());
    }

    #[test]
    fn gate_drops_late_result_of_timed_out_command() {
        let mut gate = ResultGate::default();
        gate.begin();
        assert_eq!(gate.finish(), None); // timeout
        assert!(!gate.is_settled());
        assert!(!gate.offer(FinalResult::Ok)); // the late OK
        assert!(gate.is_settled());
        gate.begin();
        assert!(gate.offer(FinalResult::Error));
        assert_eq!(gate.finish(), Some(FinalResult::Error));
    }

    #[test]
    fn gate_drops_passthrough_results() {
        let mut gate = ResultGate::default();
        gate.expect_unclaimed();
        gate.expect_unclaimed();
        assert!(!gate.offer(FinalResult::Ok));
        assert!(!gate.offer(FinalResult::Error));
        assert!(gate.is_settled());
    }

    #[test]
    fn gate_force_settle_forgets_lost_results() {
        let mut gate = ResultGate::default();
        gate.expect_unclaimed();
        gate.force_settle();
        gate.begin();
        assert!(gate.offer(FinalResult::Ok));
        assert!(gate.has_result());
    }

    #[test]
    fn gate_counts_unsolicited_result_as_owed_documented_imprecision() {
        let mut gate = ResultGate::default();
        gate.expect_unclaimed();
        assert!(!gate.offer(FinalResult::Error)); // unsolicited, eats the owed slot
        assert!(gate.is_settled());
        gate.begin();
        assert!(gate.offer(FinalResult::Ok)); // the real late OK is now accepted
        assert_eq!(gate.finish(), Some(FinalResult::Ok));
    }

    #[test]
    fn gate_ignores_unsolicited_results() {
        let mut gate = ResultGate::default();
        assert!(!gate.offer(FinalResult::Ok));
        assert!(gate.is_settled());
        gate.begin();
        assert!(gate.offer(FinalResult::Ok));
        assert!(!gate.offer(FinalResult::Ok)); // second result for same command
        assert_eq!(gate.finish(), Some(FinalResult::Ok));
    }
}
