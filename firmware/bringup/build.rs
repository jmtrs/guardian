//! Exposes the ESP-IDF build environment (linker args, cfgs) to rustc, and
//! rebuilds when the bench identity in the environment changes.
fn main() {
    embuild::espidf::sysenv::output();
    for var in [
        "GUARDIAN_DEVICE_ID",
        "GUARDIAN_DEVICE_SECRET_HEX",
        "GUARDIAN_BACKEND_URL",
    ] {
        println!("cargo:rerun-if-env-changed={var}");
    }
}
