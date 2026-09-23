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
| `TEMP_LOGIN_OTP_EMAIL` + `TEMP_LOGIN_OTP_CODE` | no | Bypass temporal: código fijo de 6 cifras solo para el email exacto y solo para login. Deben definirse juntas; 5 códigos incorrectos en 15 min bloquean ese email durante 15 min en PostgreSQL, entre todas las IPs. El resto sigue exigiendo Resend |
| `RETENTION_DAYS` | no | Retención de eventos (def. 90) |
| `PAIRING_WINDOW_MIN` | no | Ventana del código de claim (def. 15) |
| `NODE_ENV` | sí | `production` |

## Homelab

El despliegue concreto —compose, secretos y exposición por el conector
Cloudflare— vive en la **base local del homelab** (`homelab/services/guardian/`),
no en este repo. Se expone por el conector existente `jmtrs-homeserver` como
`gtapi.aggc.dev`, sin abrir puertos — lo que la placa necesita por LTE
(contrato §3: TLS válido de extremo a extremo). Los secretos NO se versionan.

### Aprovisionar un dispositivo en homelab

La imagen de producción excluye `bench.ts` (usa Prisma directo, no HTTP), así
que el provision es un one-off dentro del contenedor — mismo
`DevicesService.createDevice`, mismo `GUARDIAN_SECRET_KEY` y BD ya montados,
sin copiar secretos:

```bash
ssh root@<lxc>
cd /opt/docker/guardian   # base del compose en el homelab
docker compose exec -T backend node -e '
const { DevicesService } = require("./dist/devices/devices.service");
const { PrismaService } = require("./dist/prisma/prisma.service");
(async () => {
  const prisma = new PrismaService();
  await prisma.$connect();
  const r = await new DevicesService(prisma).createDevice("Sim");
  console.log("deviceId:  " + r.device.id);
  console.log("secretHex: " + r.secret);
  console.log("claimCode: " + r.claimCode);
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
'
```

Imprime `claimCode` (ventana `PAIRING_WINDOW_MIN`, def. 15 min) para reclamar
desde la app. `secretHex` es `K_root`: grabar en la placa (NVS) o exportar al
simulador; no se puede recuperar. El simulador apunta al homelab con
`GUARDIAN_BASE=https://gtapi.aggc.dev`.

Con firmware real, este paso lo hará la herramienta de flasheo del banco
(crear dispositivo → grabar `deviceId`+`K_root` en NVS → imprimir pegatina del
`claimCode`); el contrato es el mismo (§7 del contrato).

## Notas de contrato

- Los scripts de banco (`bench`, `drive-*`) y los tests se excluyen del build de
  producción (`tsconfig.build.json`).
- La placa habla por HMAC (no OTP): funciona aunque el email no esté configurado.
- HTTPS público lo da Cloudflare; el firmware debe validar el certificado
  (contrato §3).
