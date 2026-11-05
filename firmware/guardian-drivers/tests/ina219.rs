//! INA219 driver against embedded-hal mocks: exact I²C traffic is asserted.

use embedded_hal::i2c::{ErrorKind, NoAcknowledgeSource};
use embedded_hal_mock::eh1::i2c::{Mock as I2cMock, Transaction as I2c};
use guardian_core::ports::PowerMeter;
use guardian_core::power::PowerSample;
use guardian_core::Error;
use guardian_drivers::ina219::{Ina219, BREAKOUT_SHUNT_MILLIOHM, DEFAULT_ADDRESS};

const A: u8 = DEFAULT_ADDRESS;

fn nack() -> ErrorKind {
    ErrorKind::NoAcknowledge(NoAcknowledgeSource::Address)
}

/// Reset, identify by the power-on config, apply and verify the bench config.
fn probe() -> Vec<I2c> {
    vec![
        I2c::write(A, vec![0x00, 0x80, 0x00]),
        I2c::write_read(A, vec![0x00], vec![0x39, 0x9F]),
        I2c::write(A, vec![0x00, 0x19, 0xFF]),
        I2c::write_read(A, vec![0x00], vec![0x19, 0xFF]),
    ]
}

/// Bus then shunt register reads.
fn conversion(bus: u16, shunt: u16) -> Vec<I2c> {
    vec![
        I2c::write_read(A, vec![0x02], bus.to_be_bytes().to_vec()),
        I2c::write_read(A, vec![0x01], shunt.to_be_bytes().to_vec()),
    ]
}

fn run(i2c: &[I2c], test: impl FnOnce(&mut Ina219<I2cMock>)) {
    let mut meter = Ina219::new(I2cMock::new(i2c), A, BREAKOUT_SHUNT_MILLIOHM);
    test(&mut meter);
    meter.release().done();
}

#[test]
fn probe_resets_identifies_and_configures() {
    run(&probe(), |m| assert_eq!(m.probe(), Ok(())));
}

#[test]
fn absent_chip_is_not_found() {
    run(
        &[I2c::write(A, vec![0x00, 0x80, 0x00]).with_error(nack())],
        |m| assert_eq!(m.probe(), Err(Error::NotFound)),
    );
}

#[test]
fn foreign_chip_is_not_found() {
    run(
        &[
            I2c::write(A, vec![0x00, 0x80, 0x00]),
            I2c::write_read(A, vec![0x00], vec![0x12, 0x34]),
        ],
        |m| assert_eq!(m.probe(), Err(Error::NotFound)),
    );
}

#[test]
fn sample_before_probe_is_refused_without_bus_traffic() {
    run(&[], |m| assert_eq!(m.sample(), Err(Error::State)));
}

#[test]
fn sample_scales_shunt_to_microamps_and_bus_to_millivolts() {
    let mut t = probe();
    // Bus 3.780 V = 945 LSB << 3, CNVR set. Shunt 453 LSB = 4.53 mV = 45.3 mA.
    t.extend(conversion((945 << 3) | 0b10, 453));
    run(&t, |m| {
        m.probe().unwrap();
        assert_eq!(
            m.sample(),
            Ok(PowerSample {
                current_ua: 45_300,
                bus_mv: 3_780
            })
        );
    });
}

#[test]
fn reverse_current_is_negative() {
    let mut t = probe();
    t.extend(conversion(945 << 3, 0xFFFE)); // -2 LSB
    run(&t, |m| {
        m.probe().unwrap();
        assert_eq!(m.sample().map(|s| s.current_ua), Ok(-200));
    });
}

#[test]
fn overflow_is_rejected() {
    let mut t = probe();
    t.push(I2c::write_read(A, vec![0x02], vec![0x1D, 0x89]));
    run(&t, |m| {
        m.probe().unwrap();
        assert_eq!(m.sample(), Err(Error::Rejected));
    });
}
