#!/usr/bin/env bash
# Simula eventos v2 del dispositivo contra el backend de PROD (homelab), sin
# exponer la base ni el K_root: copia prod-sim.js al contenedor, lo ejecuta alli
# (firma + POST a localhost:3000) y lo borra. No toca este repo remoto.
#
# Uso:
#   backend/scripts/prod-sim.sh gnss_fix [n]     # n fixes moviendose (default 3)
#   backend/scripts/prod-sim.sh heartbeat        # latido (refresca lastSeen)
#   backend/scripts/prod-sim.sh suspected_movement | power_lost | battery_low
#
# Config por entorno (obligatorios; el host/contenedor del homelab no se
# commitea): SIM_HOST=<user@host> SIM_CONTAINER=<contenedor backend>
set -euo pipefail

HOST="${SIM_HOST:?SIM_HOST no definido (user@host del homelab)}"
CONTAINER="${SIM_CONTAINER:?SIM_CONTAINER no definido (nombre del contenedor backend)}"
KIND="${1:-gnss_fix}"
COUNT="${2:-3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pipe local -> fichero remoto -> contenedor -> ejecutar -> limpiar. Se coloca en
# /app/backend para que require('@prisma/client') resuelva el node_modules.
cat "${SCRIPT_DIR}/prod-sim.js" | ssh "${HOST}" "
  cat > /tmp/prod-sim.js &&
  docker cp /tmp/prod-sim.js ${CONTAINER}:/app/backend/prod-sim.js &&
  docker exec -w /app/backend ${CONTAINER} node prod-sim.js '${KIND}' '${COUNT}';
  status=\$?;
  docker exec ${CONTAINER} rm -f /app/backend/prod-sim.js;
  rm -f /tmp/prod-sim.js;
  exit \$status
"
