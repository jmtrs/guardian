#!/usr/bin/env bash
# Cargo runner: flash an ELF with the bootloader and partition table built by
# esp-idf-sys for the same profile (ESP-IDF v5.4.2), not espflash's bundled
# ones, then open the monitor.
#
#   cargo run --release            # runner calls: scripts/flash.sh <elf>
#   ESPFLASH_PORT=/dev/cu.usbserial-XXXX cargo run --release
set -euo pipefail

elf="$1"
profile_dir="$(dirname "$elf")"
# esp-idf-sys copies both images next to the ELF of the profile it built.
for image in bootloader.bin partition-table.bin; do
    if [[ ! -f "$profile_dir/$image" ]]; then
        echo "flash.sh: $profile_dir/$image missing; build first" >&2
        exit 1
    fi
done

exec espflash flash --monitor \
    --bootloader "$profile_dir/bootloader.bin" \
    --partition-table "$profile_dir/partition-table.bin" \
    "$elf"
