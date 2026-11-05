//! Exposes the ESP-IDF build environment (linker args, cfgs) to rustc.
fn main() {
    embuild::espidf::sysenv::output();
}
