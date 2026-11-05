#!/usr/bin/env bash
# Simula eventos v2 del dispositivo contra el backend de PROD (homelab), sin
# exponer la base ni el K_root: copia prod-sim.js al contenedor, lo ejecuta alli
# (firma + POST a localhost:3000) y lo borra. No toca este repo remoto.
#
# Requiere SIM_DEVICE_ID de tipo SIMULATOR. Uso:
#   backend/scripts/prod-sim.sh gnss_fix [n]     # n fixes moviendose (default 3)
#   backend/scripts/prod-sim.sh heartbeat        # latido (refresca lastSeen)
#   backend/scripts/prod-sim.sh suspected_movement | power_lost | battery_low
#
# Config obligatoria (no commiteada): SIM_HOST, SIM_CONTAINER y
# SIM_DEVICE_ID=<CUID/UUID de un dispositivo aprovisionado como SIMULATOR>.
set -euo pipefail

HOST="${SIM_HOST:?SIM_HOST no definido (user@host del homelab)}"
CONTAINER="${SIM_CONTAINER:?SIM_CONTAINER no definido (nombre del contenedor backend)}"
DEVICE_ID="${SIM_DEVICE_ID:?SIM_DEVICE_ID no definido (id del simulador)}"
KIND="${1:-gnss_fix}"
COUNT="${2:-3}"

[[ "${DEVICE_ID}" =~ ^[a-zA-Z0-9_-]{20,64}$ ]] || { echo 'SIM_DEVICE_ID invalido' >&2; exit 2; }
[[ "${CONTAINER}" =~ ^[a-zA-Z0-9_.-]+$ ]] || { echo 'SIM_CONTAINER invalido' >&2; exit 2; }
case "${KIND}" in
  gnss_fix|heartbeat|suspected_movement|power_lost|battery_low) ;;
  *) echo 'KIND invalido' >&2; exit 2 ;;
esac
if ! [[ "${COUNT}" =~ ^[0-9]+$ ]] || (( COUNT < 1 || COUNT > 100 )); then
  echo 'N debe ser un entero entre 1 y 100' >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pipe local -> fichero remoto -> contenedor -> ejecutar -> limpiar. Se coloca en
# /app/backend para que require('@prisma/client') resuelva el node_modules.
# CONTAINER ya fue reducido a [A-Za-z0-9_.-]; su expansion local dentro del
# script remoto es intencionada.
# shellcheck disable=SC2029
cat "${SCRIPT_DIR}/prod-sim.js" | ssh "${HOST}" "
  cat > /tmp/prod-sim.js &&
  docker cp /tmp/prod-sim.js ${CONTAINER}:/app/backend/prod-sim.js &&
  docker exec -e SIM_DEVICE_ID='${DEVICE_ID}' -w /app/backend ${CONTAINER} node prod-sim.js '${KIND}' '${COUNT}';
  status=\$?;
  docker exec ${CONTAINER} rm -f /app/backend/prod-sim.js;
  rm -f /tmp/prod-sim.js;
  exit \$status
"
