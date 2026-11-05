//! Bring-up use cases, driven through port fakes.

mod support;

use guardian_core::accel::{Accel, Threshold};
use guardian_core::bringup::WATCH_DURATION;
use std::time::Duration;

use guardian_core::Error;
use support::Fake;

#[test]
fn identify_checks_modem_power_every_time_and_runs_queries() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.identify();
    s.identify();
    let w = fake.world();
    assert_eq!(w.power_on_calls, 2);
    assert_eq!(w.commands.len(), 2 * (4 + 1 + 7)); // + one SIM poll each
    assert_eq!(w.commands[0], "ATE0");
    drop(w);
    assert!(fake.printed("chip: rev v3.1"));
    assert!(fake.printed("vbat: 4100 mV"));
}

#[test]
fn identify_waits_for_sim_before_network_queries() {
    let fake = Fake::with(|w| w.cpin_failures = 3);
    fake.service().identify();
    let w = fake.world();
    let first_network = w.commands.iter().position(|c| c == "AT+CICCID").unwrap();
    let polls = w.commands[..first_network]
        .iter()
        .filter(|c| *c == "AT+CPIN?")
        .count();
    assert_eq!(polls, 4 + 1); // 3 rejected + 1 ok, then the reported query
    assert_eq!(w.slept, Duration::from_secs(3));
}

#[test]
fn identify_reports_sim_never_ready_and_still_queries() {
    let fake = Fake::with(|w| w.cpin_failures = u32::MAX);
    fake.service().identify();
    assert!(fake.printed("SIM not ready after 20s"));
    assert!(fake.world().commands.iter().any(|c| c == "AT+CPSI?"));
}

#[test]
fn identify_stops_when_modem_does_not_power_on() {
    let fake = Fake::with(|w| w.power_on_result = Err(Error::Timeout));
    let mut s = fake.service();
    s.identify();
    assert_eq!(fake.world().commands.len(), 0);
    assert!(!s.modem_powered());
    assert!(fake.printed("modem power-on failed: timeout"));
}

#[test]
fn passthrough_sends_line_verbatim() {
    let fake = Fake::default();
    fake.service().handle_line("  AT+CSQ");
    assert_eq!(fake.world().raw, ["AT+CSQ"]);
}

#[test]
fn passthrough_power_down_runs_full_off_sequence() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.handle_line("!modem on");
    s.handle_line("at+cpof");
    assert!(!s.modem_powered());
    let w = fake.world();
    assert_eq!(w.power_off_calls, 1);
    assert_eq!(w.raw.len(), 0, "power-down must not bypass the sequence");
}

#[test]
fn modem_on_retries_after_modem_died_on_its_own() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.handle_line("!modem on");
    // Supply sag: the modem switches off without the service knowing.
    fake.0.borrow_mut().power_on_result = Err(Error::Timeout);
    s.handle_line("!modem on");
    assert_eq!(fake.world().power_on_calls, 2);
    assert!(!s.modem_powered());
    assert!(fake.printed("modem power-on failed: timeout"));
}

#[test]
fn modem_off_always_runs_and_clears_state() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.modem_off();
    s.handle_line("!modem on");
    s.handle_line("!modem off");
    assert_eq!(fake.world().power_off_calls, 2);
    assert!(!s.modem_powered());
}

#[test]
fn selftest_passes_at_rest() {
    let fake = Fake::default();
    assert_eq!(fake.service().sensor_selftest(), Ok(()));
    assert!(fake.printed("self-test PASS: 10/10"));
}

#[test]
fn selftest_fails_when_not_at_rest() {
    let fake = Fake::with(|w| w.sample = Accel::new(0, 0, 0));
    assert_eq!(fake.service().sensor_selftest(), Err(Error::State));
    assert!(fake.printed("self-test FAIL: 0/10"));
}

#[test]
fn selftest_reports_missing_sensor() {
    let fake = Fake::with(|w| w.probe_result = Err(Error::NotFound));
    assert_eq!(fake.service().sensor_selftest(), Err(Error::NotFound));
    assert!(fake.printed("accelerometer: not found"));
    assert!(fake.printed("nothing answers"));
}

#[test]
fn watch_counts_each_latched_interrupt() {
    let fake = Fake::with(|w| w.pending_triggers = 3);
    assert_eq!(fake.service().watch_motion(Threshold::clamped(96)), 3);
    let w = fake.world();
    assert_eq!(w.armed, Some(Threshold::clamped(96)));
    assert_eq!(w.slept, WATCH_DURATION);
}

#[test]
fn watch_aborts_after_repeated_ack_failures() {
    let fake = Fake::with(|w| {
        w.pending_triggers = 1;
        w.ack_result = Err(Error::Io);
    });
    assert_eq!(fake.service().watch_motion(Threshold::DEFAULT), 0);
    assert_eq!(fake.world().ack_calls, 3);
    assert!(fake.printed("latch not cleared: i/o error"));
    assert!(fake.printed("watch aborted"));
}

#[test]
fn sleep_turns_modem_off_holds_pins_and_sleeps() {
    let fake = Fake::default();
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Ok(())
    );
    let w = fake.world();
    assert_eq!(
        (w.power_off_calls, w.arm_calls, w.park_calls, w.deep_sleeps),
        (1, 1, 1, 1)
    );
}

#[test]
fn sleep_clears_a_pending_latch_first() {
    let fake = Fake::with(|w| w.pending_triggers = 1);
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Ok(())
    );
    let w = fake.world();
    assert_eq!((w.ack_calls, w.deep_sleeps), (1, 1));
}

#[test]
fn sleep_refuses_when_line_stuck_high() {
    let fake = Fake::with(|w| w.stuck_high = true);
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Err(Error::State)
    );
    let w = fake.world();
    assert_eq!((w.deep_sleeps, w.park_calls), (0, 0));
}

#[test]
fn sleep_refuses_when_latch_cannot_be_cleared() {
    let fake = Fake::with(|w| {
        w.pending_triggers = 1;
        w.ack_result = Err(Error::Io);
    });
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Err(Error::Io)
    );
    assert_eq!(fake.world().deep_sleeps, 0);
    assert!(fake.printed("cannot clear motion latch: i/o error"));
}

#[test]
fn sleep_refuses_when_modem_pins_not_held() {
    let fake = Fake::with(|w| w.park_result = Err(Error::Io));
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Err(Error::Io)
    );
    assert_eq!(fake.world().deep_sleeps, 0);
    assert!(fake.printed("modem pins not held (i/o error)"));
}

#[test]
fn sleep_refuses_when_wake_cannot_be_armed() {
    let fake = Fake::with(|w| w.wake_arm_result = Err(Error::Io));
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Err(Error::Io)
    );
    let w = fake.world();
    assert_eq!((w.park_calls, w.deep_sleeps), (0, 0));
    drop(w);
    assert!(fake.printed("wake source not armed"));
}

#[test]
fn sleep_refuses_without_sensor() {
    let fake = Fake::with(|w| w.probe_result = Err(Error::NotFound));
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Err(Error::NotFound)
    );
    let w = fake.world();
    assert_eq!((w.power_off_calls, w.deep_sleeps), (0, 0));
}

#[test]
fn motion_wake_acknowledges_latch() {
    let fake = Fake::with(|w| w.wake = guardian_core::ports::WakeCause::Motion);
    fake.service().announce();
    assert_eq!(fake.world().ack_calls, 1);
    assert!(fake.printed("WAKE: motion"));
    assert!(fake.printed("interrupt source 0x4a"));
}

#[test]
fn unknown_and_invalid_commands_are_reported() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.handle_line("!reboot");
    s.handle_line("!arm x");
    assert!(fake.printed("unknown command: !reboot"));
    assert!(fake.printed("invalid argument: x"));
}

#[test]
fn absent_sensor_reports_foreign_devices_on_the_bus() {
    let fake = Fake::with(|w| {
        w.probe_result = Err(Error::NotFound);
        w.bus = vec![(0x19, 0x3f)];
    });
    assert_eq!(fake.service().sensor_selftest(), Err(Error::NotFound));
    assert!(fake.printed("device at 0x19, id register 0x3f"));
    assert!(fake.printed("no LIS3DH"));
    assert!(!fake.printed("nothing answers"));
}

#[test]
fn silent_watch_reports_motion_latched_but_line_dead() {
    let fake = Fake::with(|w| w.ack_result = Ok(0x6a));
    assert_eq!(fake.service().watch_motion(Threshold::DEFAULT), 0);
    assert!(fake.printed("check INT1 -> IO34"));
}

#[test]
fn silent_watch_reports_no_motion_when_nothing_latched() {
    // Live per-axis "low" flags without IA: not an interrupt.
    let fake = Fake::with(|w| w.ack_result = Ok(0x15));
    assert_eq!(fake.service().watch_motion(Threshold::DEFAULT), 0);
    assert!(fake.printed("sensor latched nothing"));
}
