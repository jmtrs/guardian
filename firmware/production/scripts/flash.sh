#!/usr/bin/env bash
# Deliberately guarded runner for the reversible production-candidate image.
set -euo pipefail

elf="${1:?usage: scripts/flash.sh <elf>}"
profile_dir="$(dirname "$elf")"

if [[ "${GUARDIAN_CABLE_11_DISCONNECTED:-}" != 1 ]]; then
    echo "flash refused: disconnect cable 11 (S3 GPIO17 -> LILYGO RX), then set GUARDIAN_CABLE_11_DISCONNECTED=1" >&2
    exit 2
fi

[[ -f "$profile_dir/bootloader.bin" ]] || {
    echo "flash refused: missing $profile_dir/bootloader.bin; build first" >&2
    exit 2
}
[[ -f "$profile_dir/partition-table.bin" ]] || {
    echo "flash refused: missing $profile_dir/partition-table.bin; build first" >&2
    exit 2
}

exec espflash flash --monitor \
    --bootloader "$profile_dir/bootloader.bin" \
    --partition-table "$profile_dir/partition-table.bin" \
    "$elf"
