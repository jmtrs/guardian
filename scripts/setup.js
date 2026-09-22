#!/usr/bin/env node
/**
 * Setup script - Cross-platform (Windows, macOS, Linux)
 * Copies .env files and installs dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function copyEnvExample(source, dest) {
  if (!fs.existsSync(dest)) {
    try {
      fs.copyFileSync(source, dest);
      console.log(`Copied ${source} -> ${dest}`);
    } catch (err) {
      console.error(`Error copying ${source}: ${err.message}`);
    }
  } else {
    console.log(`${dest} already exists, skipping`);
  }
}

console.log('Setting up BasketBlackTop project...\n');

// Copy backend .env
const backendExample = path.join(__dirname, '..', 'backend', '.env.example');
const backendEnv = path.join(__dirname, '..', 'backend', '.env');
copyEnvExample(backendExample, backendEnv);

// Copy mobile .env
const mobileExample = path.join(__dirname, '..', 'mobile', '.env.example');
const mobileEnv = path.join(__dirname, '..', 'mobile', '.env');
copyEnvExample(mobileExample, mobileEnv);

// Install dependencies
console.log('\nInstalling dependencies...');
execSync('pnpm install', { stdio: 'inherit' });

console.log('\nSetup complete! Run "pnpm db:start" then "pnpm dev" to start');