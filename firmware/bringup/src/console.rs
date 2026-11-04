//! Operator console on UART0 (USB serial bridge): line input, stdout output.

use core::fmt;
use std::io::Write as _;

use esp_idf_svc::hal::delay::BLOCK;
use esp_idf_svc::hal::uart::UartDriver;

/// Longest operator line kept; extra characters are dropped.
pub const MAX_LINE: usize = 256;

const BACKSPACE: u8 = 0x08;
const DELETE: u8 = 0x7F;

/// Line-edited reader over the console UART.
///
/// Printable ASCII is echoed, backspace edits, CR or LF submits. Control
/// characters such as Ctrl-Z/ESC are ignored, so SMS text mode (`AT+CMGS`)
/// cannot be finished from here; it is out of scope for bring-up.
pub struct Console {
    uart: UartDriver<'static>,
}

impl Console {
    /// Take over input on the console UART. Output keeps using stdout.
    #[must_use]
    pub fn new(uart: UartDriver<'static>) -> Self {
        Self { uart }
    }

    /// Block until the operator submits a line.
    pub fn read_line(&mut self) -> String {
        let mut line = String::with_capacity(MAX_LINE);
        echo("$ ");
        loop {
            let mut byte = [0];
            if !matches!(self.uart.read(&mut byte, BLOCK), Ok(1)) {
                continue;
            }
            match byte[0] {
                b'\r' | b'\n' => {
                    echo("\n");
                    return line;
                }
                BACKSPACE | DELETE => {
                    if line.pop().is_some() {
                        echo("\u{8} \u{8}");
                    }
                }
                c @ 0x20..0x7F if line.len() < MAX_LINE => {
                    line.push(char::from(c));
                    echo(char::from(c).encode_utf8(&mut [0; 4]));
                }
                _ => {}
            }
        }
    }
}

/// Operator output sink: stdout, flushed on every write.
#[derive(Clone, Copy, Default)]
pub struct Stdout;

impl fmt::Write for Stdout {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        echo(s);
        Ok(())
    }
}

fn echo(text: &str) {
    let mut out = std::io::stdout().lock();
    let _ = out.write_all(text.as_bytes());
    let _ = out.flush();
}
