/**
 * Smoke test del artefacto CommonJS real. Jest 29 no puede cargar Better Auth
 * ESM, mientras Node 22+ sí soporta require(esm); por eso este test arranca
 * `dist/main.js` igual que el contenedor y prueba rutas HTTP reales.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 31_047;
const BASE = `http://127.0.0.1:${PORT}`;
const backendDir = path.resolve(__dirname, '..');
const output = [];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`backend exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return response;
    } catch {
      // El socket aún no escucha; reintento acotado.
    }
    await delay(250);
  }
  throw new Error('backend did not become ready within 10 seconds');
}

async function main() {
  if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.includes('_test')) {
    throw new Error('Refusing smoke test: DATABASE_URL must point to a *_test database');
  }
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      BETTER_AUTH_SECRET: 'smoke-only-secret-at-least-thirty-two-characters',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  try {
    const health = await waitUntilReady(child);
    const healthBody = await health.json();
    if (healthBody.status !== 'ok' || healthBody.database !== 'connected') {
      throw new Error(`bad health response: ${JSON.stringify(healthBody)}`);
    }
    const email = `smoke-${Date.now()}@guardian.test`;
    const auth = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, type: 'sign-in' }),
    });
    if (!auth.ok)
      throw new Error(`Better Auth smoke returned HTTP ${auth.status}: ${await auth.text()}`);
    const signIn = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, otp: '000000', name: 'Smoke Test' }),
    });
    if (!signIn.ok || !signIn.headers.get('set-cookie')) {
      throw new Error(`Better Auth sign-in failed HTTP ${signIn.status}: ${await signIn.text()}`);
    }
    console.log('built backend smoke: OK');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2_000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(output.join(''));
  console.error(error);
  process.exit(1);
});
