//! Serial bridge between the Mac and the device under test.
//!
//! The device's USB must stay unplugged while measuring (it would power the
//! board), so its console (UART0 on the `UART_TX`/`UART_RX` header pins) is
//! wired to this board instead. Lines typed on the Mac go to the device,
//! except `~` lines, which are bench commands. Device output comes back
//! prefixed with `| `, interleaved with the power readings.

use core::fmt;

use esp_idf_svc::hal::uart::UartDriver;
use esp_idf_svc::hal::usb_serial::UsbSerialDriver;
use guardian_drivers::at::LineFramer;

/// Longest line accepted from the Mac.
const MAX_HOST_LINE: usize = 128;
/// Ticks to wait for the USB host before dropping output (Mac not listening).
const HOST_WRITE_TICKS: u32 = 10;

/// Commands for the bench itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BenchCommand {
    /// Restart the running totals (`avg`, `Q`) for a new measurement.
    Reset,
    /// List the bench commands.
    Help,
    /// A `~` line that is not a bench command.
    Unknown,
}

impl BenchCommand {
    fn parse(line: &str) -> Self {
        match line.trim() {
            "~reset" => Self::Reset,
            "~help" | "~" => Self::Help,
            _ => Self::Unknown,
        }
    }
}

/// Output to the Mac through the S3's native USB.
pub struct Host {
    usb: UsbSerialDriver<'static>,
}

impl Host {
    /// Wrap the installed USB-Serial-JTAG driver.
    pub fn new(usb: UsbSerialDriver<'static>) -> Self {
        Self { usb }
    }

    /// Write a full line, CRLF appended.
    pub fn line(&mut self, args: fmt::Arguments<'_>) {
        let _ = fmt::write(self, args);
        let _ = fmt::Write::write_str(self, "\r\n");
    }
}

impl fmt::Write for Host {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        let mut rest = s.as_bytes();
        while !rest.is_empty() {
            match self.usb.write(rest, HOST_WRITE_TICKS) {
                Ok(0) | Err(_) => return Ok(()), // nobody listening: drop
                Ok(n) => rest = &rest[n..],
            }
        }
        Ok(())
    }
}

/// Mac ⇄ device line bridge.
pub struct Link {
    host: Host,
    device: UartDriver<'static>,
    host_line: String,
    device_lines: LineFramer,
}

impl Link {
    /// Bridge `host` (USB) and `device` (UART wired to the device console).
    pub fn new(host: Host, device: UartDriver<'static>) -> Self {
        Self {
            host,
            device,
            host_line: String::with_capacity(MAX_HOST_LINE),
            device_lines: LineFramer::default(),
        }
    }

    /// Output channel to the Mac.
    pub fn host(&mut self) -> &mut Host {
        &mut self.host
    }

    /// Move whatever is pending in both directions without blocking.
    /// Returns a bench command if the Mac completed a `~` line.
    pub fn poll(&mut self) -> Option<BenchCommand> {
        self.forward_device_output();
        self.take_host_input()
    }

    fn forward_device_output(&mut self) {
        let mut buf = [0u8; 128];
        while let Ok(n @ 1..) = self.device.read(&mut buf, 0) {
            let host = &mut self.host;
            self.device_lines
                .push(&buf[..n], |line| host.line(format_args!("| {line}")));
        }
    }

    fn take_host_input(&mut self) -> Option<BenchCommand> {
        let mut buf = [0u8; 64];
        let mut command = None;
        while let Ok(n @ 1..) = self.host.usb.read(&mut buf, 0) {
            for &byte in &buf[..n] {
                command = command.or(self.host_byte(byte));
            }
        }
        command
    }

    /// Accumulate one byte from the Mac; act on a completed line.
    fn host_byte(&mut self, byte: u8) -> Option<BenchCommand> {
        match byte {
            b'\r' | b'\n' => {
                let line = core::mem::take(&mut self.host_line);
                if line.starts_with('~') {
                    return Some(BenchCommand::parse(&line));
                }
                if !line.is_empty() {
                    let _ = self.device.write(line.as_bytes());
                    let _ = self.device.write(b"\n");
                }
                None
            }
            _ if self.host_line.len() < MAX_HOST_LINE && byte.is_ascii() => {
                self.host_line.push(char::from(byte));
                None
            }
            _ => None,
        }
    }
}
