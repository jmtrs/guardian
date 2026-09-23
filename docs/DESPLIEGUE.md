# Despliegue del backend

El backend se empaqueta con `backend/Dockerfile` (multi-stage, `node:22-slim`).
El **contexto de build es la raíz del repo** (necesita `pnpm-lock.yaml` +
workspace):

```bash
docker build -f backend/Dockerfile -t guardian-backend .
```

Al arrancar, el contenedor ejecuta `prisma migrate deploy` (idempotente) y luego
`node dist/main` (ver `backend/docker-entrypoint.sh`). `GET /health` confirma la
conexión a la BD.

## Variables de entorno (producción)

| Var | Obligatoria | Qué |
|---|---|---|
| `DATABASE_URL` | sí | Postgres del backend |
| `GUARDIAN_SECRET_KEY` | **sí** | Cifra el K_root en reposo (AES-256-GCM). El boot **falla** sin ella. `openssl rand -hex 32` |
| `BETTER_AUTH_SECRET` | sí | Secreto de Better Auth. `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | sí | URL pública (p.ej. `https://guardian.jmtrs.uk`) |
| `TRUSTED_ORIGINS` | reco | Orígenes extra CORS (coma). En prod solo `guardian://` + esto |
| `RESEND_API_KEY` | login | OTP de login por email (Resend). **Sin ella el login falla cerrado**; el canal de la placa (HMAC) no la necesita |
| `EMAIL_FROM` | no | Remitente del OTP (`Guardian <onboarding@resend.dev>`) |
| `RETENTION_DAYS` | no | Retención de eventos (def. 90) |
| `PAIRING_WINDOW_MIN` | no | Ventana del código de claim (def. 15) |
| `NODE_ENV` | sí | `production` |

## Homelab

El despliegue concreto —compose, secretos y exposición por el conector
Cloudflare— vive en la **base local del homelab** (`homelab/services/guardian/`),
no en este repo. Se expone por el conector existente `jmtrs-homeserver` como
`gtapi.aggc.dev`, sin abrir puertos — lo que la placa necesita por LTE
(contrato §3: TLS válido de extremo a extremo). Los secretos NO se versionan.

## Notas de contrato

- Los scripts de banco (`bench`, `drive-*`) y los tests se excluyen del build de
  producción (`tsconfig.build.json`).
- La placa habla por HMAC (no OTP): funciona aunque el email no esté configurado.
- HTTPS público lo da Cloudflare; el firmware debe validar el certificado
  (contrato §3).
