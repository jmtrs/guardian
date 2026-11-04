//! # guardian-core
//!
//! Hardware-agnostic heart of the Guardian device firmware.
//!
//! Hexagonal layout:
//!
//! - **Domain** ([`accel`], [`command`]): pure rules, no I/O.
//! - **Ports** ([`ports`]): traits the core needs from the outside world
//!   (modem, motion sensor, platform). Output goes through [`core::fmt::Write`].
//! - **Application** ([`bringup`]): bench bring-up use cases driving the ports,
//!   mapped to `docs/COMPONENTES.md` "Primera secuencia al recibir las piezas".
//!
//! The crate is `no_std` and forbids `unsafe`: it runs unchanged on the ESP32
//! and on the host, where it is tested against fakes.
#![no_std]

pub mod accel;
pub mod bringup;
pub mod command;
pub mod error;
pub mod ports;

pub use error::Error;
