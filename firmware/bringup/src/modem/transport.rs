//! AT transport over UART: a reader thread frames lines, hands every line to
//! the sink and feeds final result codes to a [`ResultGate`], which pairs them
//! with the command waiting for them.
//!
//! AT has no correlation ids. The gate counts results still owed by timed-out
//! commands and fire-and-forget passthrough lines, and drops that many before
//! accepting one. A command first waits until nothing is owed, at most
//! [`DRAIN_MAX`]; past that the owed results are presumed lost. The residual
//! risk is a result arriving after [`DRAIN_MAX`] *and* after being written off.

use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use esp_idf_svc::hal::gpio::PinId;
use esp_idf_svc::hal::uart::UartDriver;
use esp_idf_svc::sys::{self, EspError, ESP_ERR_NO_MEM};
use guardian_core::Error;
use guardian_drivers::at::{final_result, FinalResult, LineFramer, ResultGate};

/// UART read timeout per reader-thread iteration, in RTOS ticks.
const READ_TICKS: u32 = 5;
/// Back-off after a UART read error, so a persistent fault cannot spin.
const READ_ERROR_BACKOFF: Duration = Duration::from_millis(10);
const READER_STACK: usize = 6 * 1024;
/// Longest wait for results owed by earlier commands before writing them off.
const DRAIN_MAX: Duration = Duration::from_secs(2);

/// Receives every line the modem emits (responses and URCs), CR/LF stripped.
pub type LineSink = Box<dyn Fn(&str) + Send>;

/// Gate shared with the reader thread; the condvar signals both "result for
/// the waiting command" and "an owed result was consumed".
struct Shared {
    gate: Mutex<ResultGate>,
    changed: Condvar,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, ResultGate> {
        self.gate.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Called by the reader for every line, after the sink has run (the sink
    /// never runs under the lock, so a slow sink cannot block `command`).
    fn on_line(&self, line: &str) {
        if let Some(result) = final_result(line) {
            self.lock().offer(result);
            self.changed.notify_all();
        }
    }
}

/// AT command channel to the modem.
pub struct AtTransport {
    uart: Arc<UartDriver<'static>>,
    shared: Arc<Shared>,
    /// UART pads, for [`reattach`](Self::reattach).
    pads: (PinId, PinId),
}

impl AtTransport {
    /// Start the reader thread over `uart`, whose TX/RX pads are `pads`.
    ///
    /// # Errors
    /// If the reader thread cannot be spawned.
    pub fn start(
        uart: UartDriver<'static>,
        pads: (PinId, PinId),
        sink: LineSink,
    ) -> Result<Self, EspError> {
        let uart = Arc::new(uart);
        let shared = Arc::new(Shared {
            gate: Mutex::default(),
            changed: Condvar::new(),
        });
        spawn_reader(Arc::clone(&uart), Arc::clone(&shared), sink)?;
        Ok(Self { uart, shared, pads })
    }

    /// Send a command and wait for its final result code.
    ///
    /// # Errors
    /// [`Error::Rejected`] on `ERROR`, [`Error::Timeout`] if no result arrives.
    pub fn command(&self, cmd: &str, timeout: Duration) -> Result<(), Error> {
        let (mut gate, drained) = self
            .shared
            .changed
            .wait_timeout_while(self.shared.lock(), DRAIN_MAX, |g| !g.is_settled())
            .unwrap_or_else(PoisonError::into_inner);
        if drained.timed_out() {
            log::warn!("earlier AT results never arrived; writing them off");
            gate.force_settle();
        }
        gate.begin();
        drop(gate);
        self.write_line(cmd);

        let (mut gate, _) = self
            .shared
            .changed
            .wait_timeout_while(self.shared.lock(), timeout, |g| !g.has_result())
            .unwrap_or_else(PoisonError::into_inner);
        match gate.finish() {
            Some(FinalResult::Ok) => Ok(()),
            Some(FinalResult::Error) => Err(Error::Rejected),
            None => Err(Error::Timeout),
        }
    }

    /// Send a raw line (CRLF appended) without waiting. If it is an AT
    /// command, its result is owed and will be dropped by the gate instead of
    /// satisfying a later command. Non-AT text (e.g. prompt payloads) owes
    /// nothing. An AT line that never yields a final code (dial, data mode)
    /// costs the next command at most [`DRAIN_MAX`] before it is written off.
    pub fn send_raw(&self, line: &str) {
        if line
            .trim_start()
            .as_bytes()
            .get(..2)
            .is_some_and(|p| p.eq_ignore_ascii_case(b"AT"))
        {
            self.shared.lock().expect_unclaimed();
        }
        self.write_line(line);
    }

    fn write_line(&self, line: &str) {
        let written = self
            .uart
            .write(line.as_bytes())
            .and_then(|_| self.uart.write(b"\r\n"));
        if written.is_err() {
            log::error!("modem UART write failed");
        }
    }

    /// Route the TX/RX pads back to the UART after they were parked as GPIO.
    ///
    /// # Errors
    /// If ESP-IDF rejects the pin assignment.
    pub fn reattach(&self) -> Result<(), EspError> {
        let (tx, rx) = self.pads;
        // SAFETY: re-applies the pin routing of a UART this driver owns; no
        // memory is touched. -1 keeps RTS/CTS unassigned, as configured.
        sys::esp!(unsafe {
            sys::uart_set_pin(self.uart.port(), i32::from(tx), i32::from(rx), -1, -1)
        })
    }
}

fn spawn_reader(
    uart: Arc<UartDriver<'static>>,
    shared: Arc<Shared>,
    sink: LineSink,
) -> Result<(), EspError> {
    thread::Builder::new()
        .name("a7670-rx".into())
        .stack_size(READER_STACK)
        .spawn(move || {
            let mut framer = LineFramer::default();
            let mut chunk = [0u8; 128];
            loop {
                match uart.read(&mut chunk, READ_TICKS) {
                    Ok(n) => framer.push(&chunk[..n], |line| {
                        sink(line);
                        shared.on_line(line);
                    }),
                    Err(_) => thread::sleep(READ_ERROR_BACKOFF),
                }
            }
        })
        .map(drop)
        .map_err(|_| EspError::from_infallible::<ESP_ERR_NO_MEM>())
}
