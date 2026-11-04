//! # guardian-drivers
//!
//! Device drivers written against [`embedded_hal`] 1.0 traits only, so they
//! run on any HAL (ESP-IDF on the board) and are unit-tested on the host
//! with `embedded-hal-mock`.
//!
//! - [`lis3dh`]: ST LIS3DH accelerometer, implements
//!   [`MotionSensor`](guardian_core::ports::MotionSensor).
//! - [`at`]: AT line framing and result-code classification, the
//!   transport-independent half of the modem adapter.
#![no_std]

pub mod at;
pub mod lis3dh;
