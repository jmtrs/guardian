#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

// Expo 57 currently carries these advisories only inside its local build CLI.
// Forcing incompatible major versions into Expo broke its declared contracts,
// so this gate documents that narrow exception and still rejects every runtime
// high advisory and every critical advisory. Remove entries as Expo upgrades.
const expoCliHighExceptions = new Set(['decode-uri-component']);

const result = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error || !result.stdout.trim()) {
  console.error(result.error?.message ?? result.stderr ?? 'pnpm audit returned no JSON');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error(`cannot parse pnpm audit JSON: ${error.message}`);
  process.exit(2);
}

if (report.error) {
  console.error(`pnpm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(2);
}

const advisories = Object.values(report.advisories ?? {});
const rejected = [];
const waived = [];

for (const advisory of advisories) {
  const severity = String(advisory.severity ?? '').toLowerCase();
  if (severity !== 'high' && severity !== 'critical') continue;

  const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? []);
  const expoCliOnly =
    severity === 'high' &&
    expoCliHighExceptions.has(advisory.module_name) &&
    paths.length > 0 &&
    paths.every((dependencyPath) => dependencyPath.includes('>@expo/cli>'));

  (expoCliOnly ? waived : rejected).push({
    module: advisory.module_name,
    severity,
    title: advisory.title,
    paths,
  });
}

for (const advisory of waived) {
  console.warn(
    `WAIVED ${advisory.severity}: ${advisory.module} (${advisory.title}) -- Expo CLI only`,
  );
}

if (rejected.length > 0) {
  for (const advisory of rejected) {
    console.error(`${advisory.severity.toUpperCase()}: ${advisory.module} (${advisory.title})`);
    for (const dependencyPath of advisory.paths) console.error(`  ${dependencyPath}`);
  }
  process.exit(1);
}

const vulnerabilities = report.metadata?.vulnerabilities ?? {};
console.log(
  `production audit gate: OK; critical=${vulnerabilities.critical ?? 0}, high=${
    vulnerabilities.high ?? 0
  }, moderate=${vulnerabilities.moderate ?? 0}, low=${vulnerabilities.low ?? 0}`,
);
