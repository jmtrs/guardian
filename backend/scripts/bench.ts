/**
 * Bench de banco para probar PR1/PR2 a mano contra el backend en marcha.
 *
 *   npx ts-node scripts/bench.ts provision [nombre]
 *       Aprovisiona un dispositivo SIN dueño (como la placa) e imprime
 *       deviceId + secret + claimCode. La ventana de pairing es corta.
 *
 *   npx ts-node scripts/bench.ts claim <email> <code>
 *       Reclama el dispositivo con su claimCode y lo liga al usuario de ese
 *       email (debe haber iniciado sesion antes en la app). Presencia fisica
 *       en software; el reto BLE queda diferido a firmware.
 *
 *   npx ts-node scripts/bench.ts send <email> <kind>
 *       Firma un evento v2 y lo POSTea a http://localhost:3000/v1/events con la
 *       secuencia correcta (lastSeq+1). kind: suspected_movement | heartbeat |
 *       power_lost | gnss_fix | battery_low. Telemetria power incluida (v2).
 *
 *   npx ts-node scripts/bench.ts locate <email>
 *       Crea un comando LOCATE_NOW (PENDING) llamando al servicio.
 *
 *   npx ts-node scripts/bench.ts poll <email>
 *       Poll del dispositivo (canal comandos, firmado con K_command) via
 *       POST /v1/commands/poll. Imprime los PENDING vivos.
 *
 *   npx ts-node scripts/bench.ts fix <email> [commandId]
 *       Envia un gnss_fix v2 con commandId (toma el PENDING mas reciente si
 *       no se pasa) -> debe ACKear el comando.
 *
 *   npx ts-node scripts/bench.ts walk <email> [n]
 *       Envia n gnss_fix (default 5) desplazandose desde la ultima posicion
 *       conocida — dibuja un rastro real en el mapa.
 *
 *   npx ts-node scripts/bench.ts status <email>
 *       Imprime estado del dispositivo, incidentes y ultimos comandos.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { DevicesService } from '../src/devices/devices.service';
import { sign, deriveKey } from '../src/devices/protocol';
import { decryptSecret } from '../src/devices/secret-crypto';

const BASE = process.env.BENCH_BASE ?? 'http://localhost:3000';

async function firstDevice(prisma: PrismaService, email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No hay usuario con email ${email}. Inicia sesion en la app primero.`);
  const device = await prisma.device.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: 'asc' } });
  return { user, device };
}

async function main() {
  const [cmd, email, arg] = process.argv.slice(2);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    if (cmd === 'provision') {
      // Alta de banco/fabrica: crea SIN dueño (como la placa real). El slot de
      // email aqui es el nombre del dispositivo. Imprime secret + claimCode una
      // vez; el dueño lo reclama con `bench claim <email> <code>` (o desde app).
      const name = process.argv[3] ?? 'Vehiculo';
      const svc = new DevicesService(prisma);
      const { device, secret, claimCode } = await svc.createDevice(name);
      console.log('Dispositivo aprovisionado (sin dueño, en ventana de pairing).');
      console.log(`  deviceId:  ${device.id}`);
      console.log(`  secret:    ${secret}`);
      console.log(`  claimCode: ${claimCode}`);
      console.log(`Reclama con: bench claim <email> ${claimCode}`);
      return;
    }

    if (cmd === 'claim') {
      // arg = code (argv[4]); email = argv[3]. Liga el dispositivo al dueño.
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) throw new Error(`No hay usuario con email ${email}. Inicia sesion en la app primero.`);
      const svc = new DevicesService(prisma);
      const device = await svc.claimDevice(arg, user.id);
      console.log(`Reclamado: ${device.id} -> ${email}`);
      return;
    }

    if (cmd === 'send' || cmd === 'fix') {
      const { device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo. Ejecuta provision primero.');
      const seq = device.lastSeq + 1;
      const now = new Date().toISOString();
      // send <email> <kind> [vehicle|reserve]: rail que alimenta el evento.
      // argv: [node, bench.ts, send, email, kind, source]
      const source = process.argv[5] === 'reserve' ? 'reserve' : 'vehicle';
      const envelope: Record<string, unknown> = {
        schemaVersion: 2,
        deviceId: device.id,
        sequence: seq,
        kind: cmd === 'fix' ? 'gnss_fix' : arg,
        observedAtUtc: now,
        power: {
          vehicleMv: source === 'reserve' ? 9000 : arg === 'battery_low' && cmd === 'send' ? 11200 : 13600,
          reserveMv: 4100,
          source,
        },
        position:
          cmd === 'fix' || arg === 'gnss_fix'
            ? { lat: 40.4168, lon: -3.7038, fixAtUtc: now }
            : null,
      };
      if (cmd === 'fix') {
        let commandId: string | undefined = arg;
        if (!commandId) {
          const pending = await prisma.command.findFirst({
            where: { deviceId: device.id, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
          });
          commandId = pending?.id;
        }
        if (!commandId) throw new Error('No hay comandos PENDING; ejecuta locate primero.');
        envelope.commandId = commandId;
      }
      const body = Buffer.from(JSON.stringify(envelope), 'utf8');
      // Canal de eventos: siempre K_event (derivada por contexto).
      const signature = sign(body, deriveKey(decryptSecret(device.secret), device.id, 'event'));
      const res = await fetch(`${BASE}/v1/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-device-id': device.id,
          'x-guardian-signature': signature,
        },
        body,
      });
      console.log(
        `${cmd} ${String(envelope.kind)} seq=${seq}${envelope.commandId ? ` commandId=${String(envelope.commandId)}` : ''} -> HTTP ${res.status} ${await res.text()}`,
      );
      return;
    }

    if (cmd === 'locate') {
      const { user, device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo. Ejecuta provision primero.');
      const svc = new DevicesService(prisma);
      const command = await svc.requestLocate(device.id, user.id);
      console.log(`locate -> ${command.id} status=${command.status} expiresAt=${command.expiresAt.toISOString()}`);
      return;
    }

    if (cmd === 'poll') {
      const { device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo.');
      const body = Buffer.from(
        JSON.stringify({ deviceId: device.id, polledAtUtc: new Date().toISOString() }),
        'utf8',
      );
      // Canal de comandos: K_command, nunca K_event.
      const signature = sign(body, deriveKey(decryptSecret(device.secret), device.id, 'command'));
      const res = await fetch(`${BASE}/v1/commands/poll`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-device-id': device.id,
          'x-guardian-signature': signature,
        },
        body,
      });
      console.log(`poll -> HTTP ${res.status} ${await res.text()}`);
      return;
    }

    if (cmd === 'walk') {
      const { device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo. Ejecuta provision primero.');
      const n = Number(arg ?? 5);
      let seq = device.lastSeq;
      // Camina desde la ultima posicion conocida (o Madrid centro).
      let lat = device.lastLat ?? 40.4168;
      let lon = device.lastLon ?? -3.7038;
      for (let i = 0; i < n; i++) {
        seq += 1;
        lat += 0.0018 * (i % 2 === 0 ? 1 : 0.5);
        lon += 0.0026;
        const now = new Date().toISOString();
        const envelope = {
          schemaVersion: 2,
          deviceId: device.id,
          sequence: seq,
          kind: 'gnss_fix',
          observedAtUtc: now,
          power: { vehicleMv: 13600, reserveMv: 4100, source: 'vehicle' },
          position: { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), fixAtUtc: now },
        };
        const body = Buffer.from(JSON.stringify(envelope), 'utf8');
        const signature = sign(body, deriveKey(decryptSecret(device.secret), device.id, 'event'));
        const res = await fetch(`${BASE}/v1/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-device-id': device.id,
            'x-guardian-signature': signature,
          },
          body,
        });
        console.log(`walk ${i + 1}/${n} seq=${seq} -> HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 700));
      }
      return;
    }

    if (cmd === 'status') {
      const { device } = await firstDevice(prisma, email);
      if (!device) throw new Error('El usuario no tiene dispositivo.');
      const incidents = await prisma.incident.findMany({
        where: { deviceId: device.id },
        orderBy: { openedAt: 'desc' },
      });
      const commands = await prisma.command.findMany({
        where: { deviceId: device.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      console.log(`device: state=${device.state} tripState=${device.tripState} lastSeq=${device.lastSeq}`);
      console.log(
        `power: vehicleMv=${device.lastVehicleMv ?? '-'} reserveMv=${device.lastReserveMv ?? '-'} source=${device.lastPowerSource ?? '-'}`,
      );
      for (const i of incidents) {
        console.log(`  incident ${i.kind} ${i.state} (openedBySeq=${i.openedByEventSeq})`);
      }
      if (incidents.length === 0) console.log('  (sin incidentes)');
      for (const c of commands) {
        console.log(`  command ${c.type} ${c.status}${c.resultEventId ? ` -> event ${c.resultEventId}` : ''}`);
      }
      if (commands.length === 0) console.log('  (sin comandos)');
      return;
    }

    console.error('Comando desconocido. Usa: provision | claim | send | locate | poll | fix | status');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(String(e.message ?? e));
  process.exit(1);
});
