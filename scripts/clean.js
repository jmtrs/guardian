#!/usr/bin/env node
/**
 * Clean script - Cross-platform (Windows, macOS, Linux)
 * Removes build artifacts and node_modules
 */

const fs = require('fs');
const path = require('path');

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`Deleted ${folderPath}`);
    } catch (err) {
      console.error(`Error deleting ${folderPath}: ${err.message}`);
    }
  }
}

console.log('Cleaning project...\n');

const paths = [
  path.join(__dirname, '..', 'backend', 'dist'),
  path.join(__dirname, '..', 'backend', 'node_modules'),
  path.join(__dirname, '..', 'mobile', 'node_modules'),
  path.join(__dirname, '..', '.expo'),
  path.join(__dirname, '..', 'node_modules'),
];

paths.forEach(deleteFolderRecursive);

console.log('\nClean complete');