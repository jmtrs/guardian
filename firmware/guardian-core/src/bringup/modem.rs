//! Use cases driving the modem: identity, network, power, GNSS, passthrough.

use core::fmt::Write;
use core::time::Duration;

use super::{say, Bringup, Mac};
use crate::command::at_powers_down;
use crate::error::Result;
use crate::ports::{Modem, MotionSensor, Platform};

/// Timeout for identification and network queries.
const QUERY_TIMEOUT: Duration = Duration::from_secs(5);
/// GNSS power-up answers slowly on the A7670 family.
const GNSS_TIMEOUT: Duration = Duration::from_secs(10);

/// Queries identifying the modem itself; they work without a SIM. Echo goes
/// off first so responses are not interleaved with the command text.
const MODEM_QUERIES: [&str; 4] = [
    "ATE0",         // echo off
    "ATI",          // manufacturer, model, revision
    "AT+SIMCOMATI", // SIMCom extended identity (firmware build)
    "AT+CGMR",      // firmware revision
];

/// Queries on SIM and network state, run once the SIM is ready (or not).
const NETWORK_QUERIES: [&str; 7] = [
    "AT+CPIN?",  // SIM ready / PIN required
    "AT+CICCID", // SIM ICCID
    "AT+CSQ",    // signal quality
    "AT+CREG?",  // circuit-switched registration
    "AT+CEREG?", // LTE (EPS) registration
    "AT+COPS?",  // operator
    "AT+CPSI?",  // serving cell, band, RAT
];

/// How long a cold modem may take to read the SIM after answering `AT`.
pub(crate) const SIM_READY_TIMEOUT: Duration = Duration::from_secs(20);
/// Poll period while waiting for the SIM.
const SIM_POLL: Duration = Duration::from_secs(1);

impl<M: Modem, S: MotionSensor, P: Platform, W: Write> Bringup<M, S, P, W> {
    /// Power the modem on (no-op if already on).
    ///
    /// # Errors
    /// Propagates the power-on failure, after reporting it.
    pub fn modem_on(&mut self) -> Result<()> {
        if self.modem_powered {
            return Ok(());
        }
        let result = self.modem.power_on();
        self.modem_powered = result.is_ok();
        if let Err(e) = result {
            say!(self, "modem power-on failed: {e}");
        }
        result
    }

    /// Power the modem off. Always runs: the cached state may be stale after a reset.
    pub fn modem_off(&mut self) {
        self.modem.power_off();
        self.modem_powered = false;
    }

    /// Steps 1–2: board identity, modem identity, SIM and network registration.
    pub fn identify(&mut self) {
        let id = self.platform.identity();
        say!(
            self,
            "chip: rev v{}.{}, {} cores, flash {} KB, psram {} KB",
            id.chip_revision / 100,
            id.chip_revision % 100,
            id.cores,
            id.flash_bytes >> 10,
            id.psram_bytes >> 10
        );
        say!(self, "mac:  {}", Mac(id.mac));
        self.battery();

        if self.modem_on().is_err() {
            return;
        }
        self.run_queries(&MODEM_QUERIES);
        if !self.wait_sim_ready() {
            say!(self, "SIM not ready after {}s", SIM_READY_TIMEOUT.as_secs());
        }
        self.run_queries(&NETWORK_QUERIES);
    }

    fn run_queries(&mut self, queries: &[&str]) {
        for query in queries {
            say!(self, "> {query}");
            if let Err(e) = self.modem.command(query, QUERY_TIMEOUT) {
                say!(self, "  ({e})");
            }
        }
    }

    /// A cold modem answers `AT` before it has read the SIM; `AT+CPIN?`
    /// fails until then. Poll it silently (the sink still shows the lines).
    fn wait_sim_ready(&mut self) -> bool {
        let polls = SIM_READY_TIMEOUT.as_secs() / SIM_POLL.as_secs();
        for _ in 0..polls {
            if self.modem.command("AT+CPIN?", QUERY_TIMEOUT).is_ok() {
                return true;
            }
            self.platform.delay(SIM_POLL);
        }
        false
    }

    /// Step 2: start the GNSS engine. A fix is then polled with `AT+CGNSSINFO`.
    ///
    /// # Errors
    /// Modem power-on or GNSS power-up failure.
    pub fn gnss_on(&mut self) -> Result<()> {
        self.modem_on()?;
        say!(self, "> AT+CGNSSPWR=1");
        let result = self.modem.command("AT+CGNSSPWR=1", GNSS_TIMEOUT);
        match result {
            Ok(()) => say!(
                self,
                "GNSS on. Antenna outdoors, then repeat AT+CGNSSINFO until fix."
            ),
            Err(e) => say!(self, "GNSS power-up: {e}"),
        }
        result
    }

    /// Forward an operator AT line, powering the modem first if needed.
    ///
    /// A power-down line (`AT+CPOF`, `AT+CPOWD`) runs the full
    /// [`modem_off`](Self::modem_off) sequence instead, so the cached power
    /// state is only cleared once the modem is really off.
    pub fn passthrough(&mut self, line: &str) {
        if at_powers_down(line) {
            say!(self, "power-down requested: running the modem off sequence");
            self.modem_off();
            return;
        }
        if self.modem_on().is_err() {
            return;
        }
        self.modem.send_raw(line);
    }
}
