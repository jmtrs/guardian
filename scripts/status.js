#!/usr/bin/env node
/**
 * Status script - Cross-platform (Windows, macOS, Linux)
 * Shows git status and project info
 */

const { execSync } = require('child_process');

console.log('Project Status');
console.log('==================\n');

try {
  const gitStatus = execSync('git status --short', { encoding: 'utf8' });
  console.log('Git Status:');
  console.log(gitStatus || '  Working tree clean');
} catch (err) {
  console.log('  Not a git repository');
}

console.log('\nServices:');
try {
  const dockerStatus = execSync('docker compose ps 2>nul || echo "  Docker not running"', { encoding: 'utf8' });
  console.log(dockerStatus);
} catch (err) {
  console.log('  Docker not available');
}

console.log('\nURLs:');
console.log('  Backend: http://localhost:3000');
console.log('  Swagger: http://localhost:3000/docs');
console.log('  Mobile: Expo Dev Tools');