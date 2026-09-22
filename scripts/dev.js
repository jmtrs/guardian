#!/usr/bin/env node
/**
 * Development script - Cross-platform (Windows, macOS, Linux)
 * Runs backend and mobile in parallel
 */

const { spawn } = require('child_process');
const os = require('os');

const platform = os.platform();

console.log(`Starting development servers (${platform})...`);

// Start backend
const backend = spawn('pnpm', ['--filter', 'backend', 'run', 'start:dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' }
});

backend.on('error', (err) => {
  console.error('Backend failed to start:', err.message);
});

// Wait for backend to initialize, then start mobile
setTimeout(() => {
  const mobile = spawn('pnpm', ['--filter', 'mobile', 'run', 'start'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  mobile.on('error', (err) => {
    console.error('Mobile failed to start:', err.message);
  });

  mobile.on('exit', (code) => {
    console.log(`Mobile exited with code ${code}`);
    backend.kill();
    process.exit(code);
  });
}, 3000);

backend.on('exit', (code) => {
  console.log(`Backend exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  backend.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  backend.kill('SIGTERM');
  process.exit(0);
});