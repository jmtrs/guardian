#!/usr/bin/env bash
# Read-only release gate. It checks a generated sdkconfig and never flashes or
# burns eFuses. Use mode "template" only in CI for the committed review file.
set -euo pipefail

config="${1:?usage: check-security-config.sh <sdkconfig> [release|template] [project-dir]}"
mode="${2:-release}"
project_dir="${3:-$(dirname "$config")}" 

[[ -f "$config" ]] || { echo "missing sdkconfig: $config" >&2; exit 2; }
[[ "$mode" == release || "$mode" == template ]] || { echo "invalid mode: $mode" >&2; exit 2; }

required=(
  'CONFIG_ESP32_REV_MIN_FULL=300'
  'CONFIG_SECURE_BOOT=y'
  'CONFIG_SECURE_BOOT_V2_ENABLED=y'
  'CONFIG_SECURE_SIGNED_APPS_RSA_SCHEME=y'
  'CONFIG_SECURE_BOOT_BUILD_SIGNED_BINARIES=y'
  'CONFIG_SECURE_DISABLE_ROM_DL_MODE=y'
  'CONFIG_SECURE_FLASH_ENC_ENABLED=y'
  'CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE=y'
  'CONFIG_NVS_ENCRYPTION=y'
  'CONFIG_NVS_SEC_KEY_PROTECT_USING_FLASH_ENC=y'
)
for setting in "${required[@]}"; do
  grep -Fqx "$setting" "$config" || { echo "missing security setting: $setting" >&2; exit 1; }
done

forbidden=(
  CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT
  CONFIG_SECURE_BOOT_ALLOW_JTAG
  CONFIG_SECURE_BOOT_ALLOW_ROM_BASIC
  CONFIG_SECURE_INSECURE_ALLOW_DL_MODE
  CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_DEC
  CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_ENC
  CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_CACHE
)
for option in "${forbidden[@]}"; do
  if grep -Fqx "$option=y" "$config"; then
    echo "insecure setting enabled: $option" >&2
    exit 1
  fi
done

if [[ "$mode" == release ]]; then
  key_value="$(sed -n 's/^CONFIG_SECURE_BOOT_SIGNING_KEY="\(.*\)"$/\1/p' "$config")"
  [[ -n "$key_value" && "$key_value" != *'__OUTSIDE_REPOSITORY__'* ]] || {
    echo 'secure boot signing key is missing or still a template' >&2
    exit 1
  }
  if [[ "$key_value" = /* ]]; then
    key_candidate="$key_value"
  else
    key_candidate="$project_dir/$key_value"
  fi
  [[ -f "$key_candidate" ]] || {
    echo 'secure boot signing key file not found' >&2
    exit 1
  }
  repo_root="$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null)" || {
    echo 'cannot determine repository root for key isolation check' >&2
    exit 1
  }
  key_real="$(realpath "$key_candidate")"
  repo_real="$(realpath "$repo_root")"
  case "$key_real" in
    "$repo_real"|"$repo_real"/*)
      echo 'secure boot signing key must be stored outside the repository' >&2
      exit 1
      ;;
  esac
  openssl pkey -in "$key_real" -check -noout >/dev/null 2>&1 || {
    echo 'secure boot signing key is not a valid private key' >&2
    exit 1
  }
  key_description="$(openssl pkey -in "$key_real" -text -noout 2>/dev/null | head -n 1)"
  [[ "$key_description" == *'Private-Key: (3072 bit'* ]] || {
    echo 'secure boot signing key must be RSA-3072' >&2
    exit 1
  }
fi

echo "security config gate: OK ($mode); no device was modified"
