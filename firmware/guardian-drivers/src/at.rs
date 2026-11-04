//! AT protocol helpers: byte-stream line framing and final result codes.

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
}
