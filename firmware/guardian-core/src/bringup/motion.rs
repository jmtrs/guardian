//! Use cases driving the accelerometer: self-test, interrupt watch, sleep/wake.

use core::fmt::Write;
use core::time::Duration;

use super::{say, Bringup, SELFTEST_PERIOD, SELFTEST_SAMPLES, WATCH_DURATION, WATCH_POLL};
use crate::accel::Threshold;
use crate::error::{Error, Result};
use crate::ports::{Modem, MotionSensor, Platform, SensorInfo};

/// Settling time after acknowledging a latch before re-checking the line.
const RELATCH_CHECK: Duration = Duration::from_millis(50);
/// Consecutive failed acknowledges after which the watch gives up (bus fault).
const MAX_ACK_FAILURES: u32 = 3;

impl<M: Modem, S: MotionSensor, P: Platform, W: Write> Bringup<M, S, P, W> {
    /// Step 3: detect the accelerometer and check it reads ~1 g at rest.
    ///
    /// # Errors
    /// Probe/read failure, or [`Error::State`] if any sample is not at rest.
    pub fn sensor_selftest(&mut self) -> Result<()> {
        self.probe()?;
        let mut at_rest = 0;
        for _ in 0..SELFTEST_SAMPLES {
            let sample = self
                .motion
                .read()
                .inspect_err(|e| say!(self, "read failed: {e}"))?;
            let rest = sample.is_at_rest();
            at_rest += u32::from(rest);
            say!(
                self,
                "xyz mg: {:6} {:6} {:6}  |a|={:4} {}",
                sample.x,
                sample.y,
                sample.z,
                sample.magnitude_mg(),
                if rest { "" } else { "(not at rest)" }
            );
            self.platform.delay(SELFTEST_PERIOD);
        }
        let pass = at_rest == SELFTEST_SAMPLES;
        say!(
            self,
            "self-test {}: {at_rest}/{SELFTEST_SAMPLES} samples at 1 g",
            if pass { "PASS" } else { "FAIL" }
        );
        if pass {
            Ok(())
        } else {
            Err(Error::State)
        }
    }

    /// Step 4a: arm the motion interrupt and count triggers while awake.
    ///
    /// Returns the number of interrupts seen in [`WATCH_DURATION`]; 0 also when
    /// the sensor could not be probed or armed (the reason is reported). Gives
    /// up after three consecutive failed acknowledges (bus fault).
    pub fn watch_motion(&mut self, threshold: Threshold) -> u32 {
        if self.probe().is_err() || self.arm(threshold).is_err() {
            return 0;
        }
        say!(self, "move the sensor ({}s)...", WATCH_DURATION.as_secs());
        let polls = WATCH_DURATION.as_millis() / WATCH_POLL.as_millis();
        let (mut hits, mut ack_failures) = (0, 0);
        for _ in 0..polls {
            if self.motion.is_triggered() {
                match self.motion.acknowledge() {
                    Ok(source) => {
                        ack_failures = 0;
                        hits += 1;
                        say!(self, "motion #{hits}, source {source}");
                    }
                    Err(e) => {
                        say!(self, "latch not cleared: {e}");
                        ack_failures += 1;
                        if ack_failures >= MAX_ACK_FAILURES {
                            say!(self, "watch aborted: sensor not answering");
                            return hits;
                        }
                    }
                }
            }
            self.platform.delay(WATCH_POLL);
        }
        say!(self, "watch done: {hits} interrupts");
        if hits == 0 {
            self.explain_silent_line();
        }
        hits
    }

    /// After a watch with no interrupts, read the sensor's own latch to tell
    /// "no motion detected" apart from "detected, but INT1 never reached the
    /// MCU" (wiring).
    fn explain_silent_line(&mut self) {
        match self.motion.acknowledge() {
            Ok(latch) if !latch.active => {
                say!(self, "  sensor latched nothing: no motion above threshold");
            }
            Ok(latch) => say!(
                self,
                "  sensor latched motion (source {latch}) but INT1 never rose: check INT1 -> IO34"
            ),
            Err(e) => say!(self, "  sensor latch unreadable: {e}"),
        }
    }

    /// Step 4b / power test P1: modem off, motion armed, deep sleep.
    ///
    /// Refuses (and returns) when sleeping would be wrong: the latch cannot be
    /// cleared or the line stays high (it would wake at once, in a loop), the
    /// wake source cannot be armed (it would never wake), or a modem line
    /// cannot be parked (P1 would be measured in an unknown state; the adapter
    /// undoes partial parking). On hardware, success does not return.
    ///
    /// # Errors
    /// The reason for refusing, after reporting it.
    pub fn sleep_until_motion(&mut self, threshold: Threshold) -> Result<()> {
        self.probe()?;
        self.modem_off();
        self.arm(threshold)?;
        if let Err(e) = self.interrupt_line_clear() {
            say!(self, "refusing to sleep: it would wake at once");
            return Err(e);
        }
        if let Err(e) = self.platform.arm_motion_wake() {
            say!(self, "refusing to sleep: wake source not armed ({e})");
            return Err(e);
        }
        if let Err(e) = self.modem.park_for_sleep() {
            say!(self, "refusing to sleep: modem pins not held ({e})");
            return Err(e);
        }
        say!(
            self,
            "P1: deep sleep, modem off. Measure current now; move sensor to wake."
        );
        self.platform.deep_sleep();
        Ok(())
    }

    fn probe(&mut self) -> Result<SensorInfo> {
        let info = self.motion.probe().inspect_err(|e| {
            say!(self, "accelerometer: {e}");
            if *e == Error::NotFound {
                self.explain_absence();
            }
        })?;
        say!(
            self,
            "accelerometer at {:#04x}, id {:#04x}",
            info.address,
            info.chip_id
        );
        Ok(info)
    }

    /// After a failed probe, tell "nothing on the bus" (wiring) apart from
    /// "something answers, but not a LIS3DH" (chip or address).
    fn explain_absence(&mut self) {
        say!(self, "scanning the I2C bus...");
        let out = &mut self.out;
        let mut answers = 0u32;
        self.motion.scan(&mut |address, id| {
            answers += 1;
            let _ = writeln!(out, "  device at {address:#04x}, id register {id:#04x}");
        });
        if answers == 0 {
            say!(
                self,
                "  nothing answers: check VCC/GND contact, SDA=IO21, SCL=IO22, CS to 3V3"
            );
        } else {
            say!(self, "  no LIS3DH (id 0x33 at 0x18/0x19) among them");
        }
    }

    fn arm(&mut self, threshold: Threshold) -> Result<()> {
        self.motion
            .arm(threshold)
            .inspect_err(|e| say!(self, "arm failed: {e}"))?;
        say!(self, "motion armed at {} mg", threshold.mg());
        Ok(())
    }

    /// Acknowledge any pending latch and confirm the line is low.
    fn interrupt_line_clear(&mut self) -> Result<()> {
        if !self.motion.is_triggered() {
            return Ok(());
        }
        self.motion
            .acknowledge()
            .inspect_err(|e| say!(self, "cannot clear motion latch: {e}"))?;
        self.platform.delay(RELATCH_CHECK);
        if self.motion.is_triggered() {
            say!(self, "interrupt line stuck high");
            return Err(Error::State);
        }
        Ok(())
    }
}
