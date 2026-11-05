//! # guardian-drivers
//!
//! Device drivers written against [`embedded_hal`] 1.0 traits only, so they
//! run on any HAL (ESP-IDF on the board) and are unit-tested on the host
//! with `embedded-hal-mock`.
//!
//! - [`lis3dh`]: ST LIS3DH accelerometer, implements
//!   [`MotionSensor`](guardian_core::ports::MotionSensor).
//! - [`ina219`]: TI INA219 current monitor for the power bench, implements
//!   [`PowerMeter`](guardian_core::ports::PowerMeter).
//! - [`at`]: AT line framing and result-code classification, the
//!   transport-independent half of the modem adapter.
#![no_std]

pub mod at;
pub mod ina219;
pub mod lis3dh;
