//! Shared ESP-IDF adapters for the LILYGO T-A7670E Guardian board.
//!
//! This crate owns target-specific board, GPIO-hold and A7670 code. The
//! interactive bring-up and production binaries remain separate composition
//! roots and depend on these adapters without depending on each other.
#![deny(missing_docs)]

pub mod board;
pub mod hold;
pub mod modem;
