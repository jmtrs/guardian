# Guardian — App móvil (Expo)

App de control del guardián: login por OTP, panel de estado del vehículo, mapa de
ubicación y historial de eventos. Piel HUD oscura tipo instrumento (tema
configurable).

> **Requiere dev build (no Expo Go).** La app usa módulos nativos
> (`@maplibre/maplibre-react-native`, `react-native-gesture-handler`,
> `react-native-reanimated`, `expo-secure-store`). Hay que compilar el binario con
> `expo run:android` / `expo run:ios`; Expo Go no puede cargarlos.

## Funcionalidad actual

- **Login OTP por email** (Better Auth, sin contraseña). En desarrollo el código
  es fijo **`000000`** (se loguea también en la consola del backend).
- **Dashboard** con recuadros **reordenables** (long‑press para arrastrar, el orden
  se persiste):
  - **Ubicación del vehículo** — última posición geocodificada (calle, ciudad,
    país). Tap → pantalla de mapa.
  - **Eventos recientes** — últimos eventos con glifo, etiqueta y hora.
  - **Estado** — `ARMADO` / `VIAJE AUTORIZADO` / `ALERTA` (alerta con latido rojo),
    último contacto y batería.
  - **CTA fijo** Iniciar / Finalizar viaje (con update optimista).
- **Mapa** (`app/(home)/map.tsx`): OpenFreeMap dark (vector, sin API key), marcador
  de posición, rastro del viaje (polyline), dirección por reverse‑geocode
  (Nominatim) y botones para abrir en **Google Maps** / **Waze**.
- **Historial** completo de eventos con lugar geocodificado.
- **Ajustes**: tema (presets + acento personalizado), idioma (ES/EN) y cerrar sesión.

## Requisitos

- Node 20+, **pnpm** (monorepo).
- **Android**: SDK con `platform-tools`, `build-tools`, una `platform` y `ndk`
  (p.ej. vía Android Studio o `android-commandlinetools`). `ANDROID_HOME` exportado.
- **iOS**: macOS + Xcode.

## Arranque

Desde la raíz del monorepo, con el **backend levantado** (ver `../README.md` y
`../backend`): `db-start`, `db-migrate`, `seed-device`, backend en `:3000`.

```bash
# 1. Variables (API que verá la app)
cp .env.example .env.local        # EXPO_PUBLIC_API_URL=http://localhost:3000

# 2. Compilar + instalar el dev build en un dispositivo/emulador
#    (regenera android/ con expo prebuild la primera vez)
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm android      # o: pnpm ios

# 3. Metro (si no lo arrancó el paso anterior)
EXPO_PUBLIC_API_URL=http://localhost:3000 pnpm start --localhost
```

### Dispositivo Android físico por USB

`localhost` del móvil apunta al móvil, no a tu máquina. Con USB (depuración
activada) mapea los puertos:

```bash
adb reverse tcp:8081 tcp:8081     # Metro
adb reverse tcp:3000 tcp:3000     # backend
```

Así `EXPO_PUBLIC_API_URL=http://localhost:3000` funciona a través del cable.
El backend debe tener `guardian://` en `trustedOrigins` (ya configurado) porque el
dev build envía ese `Origin` a Better Auth.

## Poblar datos de prueba

Con el dispositivo de banco sembrado (`node ../backend/scripts/seed-device.mjs`,
imprime `GUARDIAN_DEVICE_KEY_HEX`), usa el simulador Python (`python3 -m
guardian.simulator`) o firma eventos con HMAC contra `POST /v1/events`. Los eventos
con `position` alimentan el mapa; `battery_low`/`suspected_movement` alimentan
estado e historial.

## Calidad

```bash
pnpm exec tsc --noEmit    # typecheck
pnpm test                 # jest
pnpm lint
```

Estructura: rutas en `app/` (expo-router), pantallas en `src/pages/`, cliente API y
hooks de datos en `src/api/`, utilidades en `src/lib/`, sistema de UI/tema en
`src/ui/`.
