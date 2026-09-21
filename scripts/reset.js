#!/usr/bin/env node
/**
 * Reset script - Limpia caché y reinstala dependencias
 * Útil cuando hay errores de bundler o módulos corruptos
 *
 * Uso:
 *   node scripts/reset.js         // Solo limpiar
 *   node scripts/reset.js --dev   // Limpiar e iniciar dev servers
 *   node scripts/reset.js --web   // Limpiar e iniciar web
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = __dirname.replace('/scripts', '');
const mobileDir = path.join(rootDir, 'mobile');

function run(cmd, cwd = rootDir) {
  console.log(`\n▶ ${cmd}`);
  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd
    });
  } catch (err) {
    console.error(`✗ Error ejecutando: ${cmd}`);
    process.exit(1);
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    console.log(`  Eliminando ${path.basename(dir)}...`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('🧹 Limpiando entorno...\n');

// 1. Matar procesos
console.log('1️⃣  Matando procesos previos...');
run('pkill -9 node || true');
run('pkill -9 expo || true');
run('pkill -9 nest || true');

// 2. Limpiar directorios
console.log('\n2️⃣  Limpiando caché y módulos...');
removeDir(path.join(mobileDir, 'node_modules'));
removeDir(path.join(mobileDir, '.expo'));
removeDir(path.join(mobileDir, '.next'));
removeDir(path.join(rootDir, 'node_modules/.cache'));

if (fs.existsSync(path.join(mobileDir, 'package-lock.json'))) {
  console.log('  Eliminando package-lock.json...');
  fs.unlinkSync(path.join(mobileDir, 'package-lock.json'));
}

// 3. Reinstalar dependencias
console.log('\n3️⃣  Reinstalando dependencias...');
run('npm install', mobileDir);

// 4. Limpiar pretty-format si es necesario
console.log('\n4️⃣  Verificando pretty-format...');
run('npm install pretty-format@29 --save-dev', mobileDir);

console.log('\n✅ Limpieza completada!');

// 5. Iniciar si se pide
const args = process.argv.slice(2);
if (args.includes('--dev')) {
  console.log('\n🚀 Iniciando dev servers...');
  run('node scripts/dev.js', rootDir);
} else if (args.includes('--web')) {
  console.log('\n🚀 Iniciando web...');
  run('npx expo start -c --web', mobileDir);
} else {
  console.log('\n💡 Opciones:');
  console.log('   node scripts/reset.js --dev   # Reiniciar dev servers');
  console.log('   node scripts/reset.js --web   # Reiniciar web');
}
