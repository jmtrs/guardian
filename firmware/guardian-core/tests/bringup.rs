//! Bring-up use cases, driven through port fakes.

mod support;

use guardian_core::accel::{Accel, Threshold};
use guardian_core::bringup::WATCH_DURATION;
use guardian_core::Error;
use support::Fake;

#[test]
fn identify_powers_modem_once_and_runs_queries() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.identify();
    s.identify();
    let w = fake.world();
    assert_eq!(w.power_on_calls, 1);
    assert_eq!(w.commands.len(), 22);
    assert_eq!(w.commands[0], "ATE0");
    drop(w);
    assert!(fake.printed("chip: rev v3.1"));
    assert!(fake.printed("vbat: 4100 mV"));
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
fn passthrough_power_down_invalidates_state() {
    let fake = Fake::default();
    let mut s = fake.service();
    s.handle_line("AT+CPOF");
    assert!(!s.modem_powered());
    s.handle_line("!modem on");
    assert_eq!(fake.world().power_on_calls, 2);
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
        (w.power_off_calls, w.arm_calls, w.hold_calls, w.deep_sleeps),
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
    assert_eq!((w.deep_sleeps, w.hold_calls), (0, 0));
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
    let fake = Fake::with(|w| w.hold_result = Err(Error::Io));
    assert_eq!(
        fake.service().sleep_until_motion(Threshold::DEFAULT),
        Err(Error::Io)
    );
    assert_eq!(fake.world().deep_sleeps, 0);
    assert!(fake.printed("modem pins not held (i/o error)"));
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
