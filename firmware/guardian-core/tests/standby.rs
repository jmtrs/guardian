//! Power test P2: deep sleep with the modem registered in its own LTE sleep.

mod support;

use guardian_core::accel::Threshold;
use guardian_core::Error;
use support::Fake;

#[test]
fn standby_keeps_modem_on_and_parks_it_asleep() {
    let fake = Fake::default();
    assert_eq!(fake.service().sleep_with_lte(Threshold::DEFAULT), Ok(()));
    let w = fake.world();
    assert_eq!(
        (w.power_on_calls, w.power_off_calls, w.arm_calls),
        (1, 0, 1)
    );
    assert_eq!((w.standby_calls, w.park_calls, w.deep_sleeps), (1, 0, 1));
    drop(w);
    assert!(fake.printed("P2: deep sleep, modem in LTE sleep."));
}

#[test]
fn standby_refuses_when_modem_does_not_power_on() {
    let fake = Fake::with(|w| w.power_on_result = Err(Error::Timeout));
    assert_eq!(
        fake.service().sleep_with_lte(Threshold::DEFAULT),
        Err(Error::Timeout)
    );
    let w = fake.world();
    assert_eq!((w.arm_calls, w.standby_calls, w.deep_sleeps), (0, 0, 0));
    drop(w);
    assert!(fake.printed("modem power-on failed: timeout"));
}

#[test]
fn standby_refuses_when_modem_lines_not_held() {
    let fake = Fake::with(|w| w.standby_result = Err(Error::Io));
    assert_eq!(
        fake.service().sleep_with_lte(Threshold::DEFAULT),
        Err(Error::Io)
    );
    assert_eq!(fake.world().deep_sleeps, 0);
    assert!(fake.printed("refusing to sleep: modem pins not held (i/o error)"));
}

#[test]
fn standby_refuses_when_line_stuck_high_before_touching_the_modem_lines() {
    let fake = Fake::with(|w| w.stuck_high = true);
    assert_eq!(
        fake.service().sleep_with_lte(Threshold::DEFAULT),
        Err(Error::State)
    );
    let w = fake.world();
    assert_eq!((w.standby_calls, w.deep_sleeps), (0, 0));
}

#[test]
fn console_line_runs_standby() {
    let fake = Fake::default();
    fake.service().handle_line("!standby 300");
    let w = fake.world();
    assert_eq!(w.armed, Some(Threshold::clamped(300)));
    assert_eq!(w.standby_calls, 1);
}
