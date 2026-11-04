//! LIS3DH driver against embedded-hal mocks: exact I²C traffic is asserted.

use embedded_hal::i2c::{ErrorKind, NoAcknowledgeSource};
use embedded_hal_mock::eh1::delay::NoopDelay;
use embedded_hal_mock::eh1::digital::{Mock as PinMock, State, Transaction as Pin};
use embedded_hal_mock::eh1::i2c::{Mock as I2cMock, Transaction as I2c};
use guardian_core::accel::{Accel, Threshold};
use guardian_core::ports::{MotionSensor, SensorInfo};
use guardian_core::Error;
use guardian_drivers::lis3dh::Lis3dh;

fn nack() -> ErrorKind {
    ErrorKind::NoAcknowledge(NoAcknowledgeSource::Address)
}

/// Successful probe at `address` (`WHO_AM_I` + sampling config).
fn probe_at(address: u8) -> Vec<I2c> {
    vec![
        I2c::write_read(address, vec![0x0F], vec![0x33]),
        I2c::write(address, vec![0x20, 0x57]),
        I2c::write(address, vec![0x23, 0x88]),
    ]
}

fn run(i2c: &[I2c], pin: &[Pin], test: impl FnOnce(&mut Lis3dh<I2cMock, PinMock, NoopDelay>)) {
    let mut sensor = Lis3dh::new(I2cMock::new(i2c), PinMock::new(pin), NoopDelay::new());
    test(&mut sensor);
    let (mut i2c, mut pin, _) = sensor.release();
    i2c.done();
    pin.done();
}

#[test]
fn probe_falls_back_to_second_address() {
    let mut t = vec![I2c::write_read(0x18, vec![0x0F], vec![0]).with_error(nack())];
    t.extend(probe_at(0x19));
    run(&t, &[], |s| {
        assert_eq!(
            s.probe(),
            Ok(SensorInfo {
                address: 0x19,
                chip_id: 0x33
            })
        );
        assert_eq!(
            s.probe(),
            Ok(SensorInfo {
                address: 0x19,
                chip_id: 0x33
            })
        ); // idempotent
    });
}

#[test]
fn probe_rejects_lis3dsh() {
    let t = vec![
        I2c::write_read(0x18, vec![0x0F], vec![0x3F]),
        I2c::write_read(0x19, vec![0x0F], vec![0]).with_error(nack()),
    ];
    run(&t, &[], |s| assert_eq!(s.probe(), Err(Error::NotFound)));
}

#[test]
fn probe_retries_after_configuration_failure() {
    let mut t = vec![
        I2c::write_read(0x18, vec![0x0F], vec![0x33]),
        I2c::write(0x18, vec![0x20, 0x57]).with_error(nack()),
    ];
    t.extend(probe_at(0x18));
    run(&t, &[], |s| {
        assert_eq!(s.probe(), Err(Error::Io));
        assert!(s.probe().is_ok());
    });
}

#[test]
fn read_before_probe_is_a_state_error() {
    run(&[], &[], |s| assert_eq!(s.read(), Err(Error::State)));
}

#[test]
fn read_decodes_12_bit_left_justified_mg() {
    let mut t = probe_at(0x18);
    // x = +16 mg (0x0100), y = -16 mg (0xFF00), z = +1000 mg (0x3E80)
    t.push(I2c::write_read(
        0x18,
        vec![0xA8],
        vec![0x00, 0x01, 0x00, 0xFF, 0x80, 0x3E],
    ));
    run(&t, &[], |s| {
        s.probe().unwrap();
        assert_eq!(s.read(), Ok(Accel::new(16, -16, 1000)));
    });
}

#[test]
fn arm_writes_an3308_wakeup_recipe() {
    let mut t = probe_at(0x18);
    t.extend([
        I2c::write(0x18, vec![0x20, 0x27]),
        I2c::write(0x18, vec![0x21, 0x01]),
        I2c::write(0x18, vec![0x22, 0x40]),
        I2c::write(0x18, vec![0x23, 0x88]),
        I2c::write(0x18, vec![0x24, 0x08]),
        I2c::write(0x18, vec![0x32, 0x05]), // 80 mg / 16
        I2c::write(0x18, vec![0x33, 0x00]),
        I2c::write_read(0x18, vec![0x26], vec![0]),
        I2c::write(0x18, vec![0x30, 0x2A]),
        I2c::write_read(0x18, vec![0x31], vec![0x00]),
    ]);
    run(&t, &[], |s| {
        s.probe().unwrap();
        assert_eq!(s.arm(Threshold::DEFAULT), Ok(()));
    });
}

#[test]
fn interrupt_line_and_acknowledge() {
    let mut t = probe_at(0x18);
    t.push(I2c::write_read(0x18, vec![0x31], vec![0x4A]));
    let pin = vec![Pin::get(State::High), Pin::get(State::Low)];
    run(&t, &pin, |s| {
        s.probe().unwrap();
        assert!(s.is_triggered());
        assert_eq!(s.acknowledge(), Ok(0x4A));
        assert!(!s.is_triggered());
    });
}

#[test]
fn scan_reports_every_answering_address_with_its_id() {
    let t: Vec<I2c> = (0x08..=0x77u8)
        .map(|a| match a {
            0x19 => I2c::write_read(a, vec![0x0F], vec![0x3F]),
            0x40 => I2c::write_read(a, vec![0x0F], vec![0x00]),
            _ => I2c::write_read(a, vec![0x0F], vec![0]).with_error(nack()),
        })
        .collect();
    run(&t, &[], |s| {
        let mut seen = Vec::new();
        s.scan(&mut |address, id| seen.push((address, id)));
        assert_eq!(seen, [(0x19, 0x3F), (0x40, 0x00)]);
    });
}
