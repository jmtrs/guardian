//! Power-window accounting: time-weighted means, extremes, charge, output.

use core::time::Duration;

use guardian_core::power::{PowerSample, PowerWindow, Summary};

const MS_100: Duration = Duration::from_millis(100);

fn sample(current_ua: i32) -> PowerSample {
    PowerSample {
        current_ua,
        bus_mv: 3_781,
    }
}

/// Push `currents` at a fixed period, returning every closed window.
fn run(window: &mut PowerWindow, currents: &[i32], dt: Duration) -> Vec<Summary> {
    currents
        .iter()
        .filter_map(|&c| window.push(sample(c), dt))
        .collect()
}

#[test]
fn window_closes_once_its_length_is_covered() {
    let mut window = PowerWindow::new(Duration::from_secs(1));
    let closed = run(&mut window, &[10_000; 9], MS_100);
    assert_eq!(closed, Vec::<Summary>::new());
    let summary = window
        .push(sample(10_000), MS_100)
        .expect("10th sample closes");
    assert_eq!(summary.since_start, Duration::from_secs(1));
    assert_eq!(summary.mean_ua, 10_000);
    assert_eq!(summary.bus_mv, 3_781);
}

#[test]
fn mean_is_weighted_by_time_not_by_sample_count() {
    let mut window = PowerWindow::new(Duration::from_secs(1));
    // 900 ms at 1 mA, then a 100 ms burst at 101 mA: mean 11 mA.
    window.push(sample(1_000), Duration::from_millis(900));
    let summary = window.push(sample(101_000), MS_100).expect("closed");
    assert_eq!(summary.mean_ua, 11_000);
    assert_eq!(summary.min_ua, 1_000);
    assert_eq!(summary.max_ua, 101_000);
}

#[test]
fn extremes_reset_per_window_but_totals_accumulate() {
    let mut window = PowerWindow::new(Duration::from_secs(1));
    let mut currents = vec![200_000; 10];
    currents.extend([2_000; 10]);
    let closed = run(&mut window, &currents, MS_100);
    assert_eq!(closed.len(), 2);
    assert_eq!(closed[1].max_ua, 2_000);
    assert_eq!(closed[1].mean_ua, 2_000);
    assert_eq!(closed[1].overall_ua, 101_000);
    assert_eq!(closed[1].since_start, Duration::from_secs(2));
}

#[test]
fn charge_is_integrated_in_microamp_hours() {
    let mut window = PowerWindow::new(Duration::from_secs(3_600));
    // 36 mA for one hour = 36 000 µAh.
    let summary = window
        .push(sample(36_000), Duration::from_secs(3_600))
        .expect("closed");
    assert_eq!(summary.charge_uah, 36_000);
}

#[test]
fn summary_prints_milliamps_volts_and_milliamp_hours() {
    let summary = Summary {
        since_start: Duration::from_secs(12),
        mean_ua: 45_310,
        min_ua: -120,
        max_ua: 1_234_560,
        bus_mv: 3_781,
        overall_ua: 150,
        charge_uah: 152,
    };
    assert_eq!(
        summary.to_string(),
        "t=   12s  I    45.31 mA  min    -0.12  max  1234.56  V 3.781 V  avg     0.15 mA  Q 0.152 mAh"
    );
}
