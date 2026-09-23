#!/bin/sh
# Arranque del backend Guardian en contenedor: aplica migraciones y levanta Nest.
# migrate deploy es idempotente (solo aplica lo pendiente) y no interactivo.
set -e

echo "[guardian] prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy

echo "[guardian] starting backend on :${PORT:-3000}"
exec node dist/main
