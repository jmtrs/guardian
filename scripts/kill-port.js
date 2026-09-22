#!/usr/bin/env node
/**
 * Kill process on ports - Cross-platform (Windows, macOS, Linux)
 * Usage: node kill-port.js [port]
 * Default: kills both backend (3000) and mobile/metro (8081)
 */

const { execSync } = require('child_process');
const os = require('os');

const DEFAULT_PORTS = [3000, 8081, 8002, 6006];
const portArg = process.argv[2];
const PORTS = portArg ? [parseInt(portArg)] : DEFAULT_PORTS;

function killPortWindows(port) {
  try {
    // Try PowerShell method first (Windows 8+)
    execSync(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'pipe' }
    );
    console.log(`[OK] Process on port ${port} killed`);
    return true;
  } catch {
    // Fallback to netstat + taskkill
    try {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: 'pipe' });
      const lines = output.trim().split('\n');
      const pids = new Set();
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(parseInt(pid))) {
          pids.add(pid);
        }
      }
      
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' });
        } catch {
          // PID may have already exited
        }
      }
      console.log(`[OK] Process on port ${port} killed`);
      return true;
    } catch {
      console.log(`[INFO] No process found on port ${port}`);
      return false;
    }
  }
}

function killPortUnix(port) {
  try {
    const output = execSync(`lsof -t -i:${port} 2>/dev/null || echo ""`, { encoding: 'utf8' });
    const pids = output.trim().split('\n').filter(Boolean);
    
    if (pids.length === 0) {
      console.log(`[INFO] No process found on port ${port}`);
      return false;
    }
    
    for (const pid of pids) {
      try {
        execSync(`kill -9 ${pid} 2>/dev/null`);
      } catch {
        // PID may have already exited
      }
    }
    console.log(`[OK] Process on port ${port} killed`);
    return true;
  } catch {
    console.log(`[INFO] No process found on port ${port}`);
    return false;
  }
}

const platform = os.platform();

for (const port of PORTS) {
  console.log(`[...] Checking port ${port}...`);
  if (platform === 'win32') {
    killPortWindows(port);
  } else {
    killPortUnix(port);
  }
}
