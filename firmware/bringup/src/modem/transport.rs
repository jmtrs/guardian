//! AT transport over UART: a reader thread frames lines, hands every line to
//! the sink and offers final result codes to the command waiting for them.

use std::sync::{Arc, Condvar, Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use esp_idf_svc::hal::uart::UartDriver;
use esp_idf_svc::sys::{EspError, ESP_ERR_NO_MEM};
use guardian_core::Error;
use guardian_drivers::at::{final_result, FinalResult, LineFramer};

/// UART read timeout per reader-thread iteration, in RTOS ticks.
const READ_TICKS: u32 = 5;
const READER_STACK: usize = 6 * 1024;

/// Receives every line the modem emits (responses and URCs), CR/LF stripped.
pub type LineSink = Box<dyn Fn(&str) + Send>;

/// Result slot shared with the reader thread. Results are accepted only while
/// `awaiting`, so a late answer to an earlier (timed-out) command, or a
/// passthrough result, cannot satisfy the next one. AT has no correlation ids;
/// the remaining window is the instant between arming and the command
/// reaching the modem.
#[derive(Default)]
struct Slot {
    awaiting: bool,
    result: Option<FinalResult>,
}

#[derive(Default)]
struct Results {
    slot: Mutex<Slot>,
    ready: Condvar,
}

impl Results {
    fn offer(&self, result: FinalResult) {
        let mut slot = self.slot.lock().unwrap_or_else(PoisonError::into_inner);
        if slot.awaiting && slot.result.is_none() {
            slot.result = Some(result);
            self.ready.notify_one();
        }
    }
}

/// AT command channel to the modem.
pub struct AtTransport {
    uart: Arc<UartDriver<'static>>,
    results: Arc<Results>,
}

impl AtTransport {
    /// Start the reader thread over `uart`.
    ///
    /// # Errors
    /// If the reader thread cannot be spawned.
    pub fn start(uart: UartDriver<'static>, sink: LineSink) -> Result<Self, EspError> {
        let uart = Arc::new(uart);
        let results = Arc::new(Results::default());
        spawn_reader(Arc::clone(&uart), Arc::clone(&results), sink)?;
        Ok(Self { uart, results })
    }

    /// Send a command and wait for its final result code.
    ///
    /// # Errors
    /// [`Error::Rejected`] on `ERROR`, [`Error::Timeout`] if no result arrives.
    pub fn command(&self, cmd: &str, timeout: Duration) -> Result<(), Error> {
        let mut slot = self
            .results
            .slot
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        *slot = Slot {
            awaiting: true,
            result: None,
        };
        drop(slot);
        self.send_raw(cmd);

        let slot = self
            .results
            .slot
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let (mut slot, _) = self
            .results
            .ready
            .wait_timeout_while(slot, timeout, |s| s.result.is_none())
            .unwrap_or_else(PoisonError::into_inner);
        slot.awaiting = false;
        match slot.result.take() {
            Some(FinalResult::Ok) => Ok(()),
            Some(FinalResult::Error) => Err(Error::Rejected),
            None => Err(Error::Timeout),
        }
    }

    /// Send a raw line (CRLF appended) without waiting.
    pub fn send_raw(&self, line: &str) {
        if self
            .uart
            .write(line.as_bytes())
            .and_then(|_| self.uart.write(b"\r\n"))
            .is_err()
        {
            log::error!("modem UART write failed");
        }
    }
}

fn spawn_reader(
    uart: Arc<UartDriver<'static>>,
    results: Arc<Results>,
    sink: LineSink,
) -> Result<(), EspError> {
    thread::Builder::new()
        .name("a7670-rx".into())
        .stack_size(READER_STACK)
        .spawn(move || {
            let mut framer = LineFramer::default();
            let mut chunk = [0u8; 128];
            loop {
                let n = uart.read(&mut chunk, READ_TICKS).unwrap_or(0);
                framer.push(&chunk[..n], |line| {
                    sink(line);
                    if let Some(result) = final_result(line) {
                        results.offer(result);
                    }
                });
            }
        })
        .map(drop)
        .map_err(|_| EspError::from_infallible::<{ ESP_ERR_NO_MEM }>())
}
