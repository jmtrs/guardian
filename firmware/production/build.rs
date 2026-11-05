//! ESP-IDF environment plus the canonical custom partition-table artifact.

use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    embuild::espidf::sysenv::output();
    println!("cargo:rerun-if-env-changed=GUARDIAN_BACKEND_URL");
    println!("cargo:rerun-if-changed=partitions.csv");
    generate_partition_table();
}

/// `esp-idf-sys` cannot consume a custom CSV from `sdkconfig.defaults` in a
/// native Cargo build. Generate it with ESP-IDF's own validator after that
/// dependency has built, then replace the profile artifact that packagers and
/// the guarded runner consume.
fn generate_partition_table() {
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set by Cargo"));
    let profile_dir = out_dir
        .ancestors()
        .nth(3)
        .expect("Cargo profile directory is an OUT_DIR ancestor");
    let tools_root = env::var_os("HOME")
        .map(PathBuf::from)
        .expect("HOME is required by the global ESP-IDF tool installation")
        .join(".espressif/esp-idf");
    let idf_version = env::var_os("ESP_IDF_VERSION").unwrap_or_else(|| OsString::from("v5.4.2"));
    let generator = tools_root
        .join(idf_version)
        .join("components/partition_table/gen_esp32part.py");
    let csv = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest directory"))
        .join("partitions.csv");
    let generated = out_dir.join("partition-table.bin");
    let status = Command::new("python3")
        .arg(&generator)
        .arg(&csv)
        .arg(&generated)
        .status()
        .unwrap_or_else(|error| panic!("cannot run {}: {error}", generator.display()));
    assert!(status.success(), "invalid production partition table");
    fs::copy(&generated, profile_dir.join("partition-table.bin"))
        .expect("cannot install production partition-table.bin");
}
