#!/usr/bin/env node
/**
 * Asserts every external package imported by src/ is declared in package.json.
 *
 * This exists because the failure it catches is invisible until production.
 * Locally, and during the Docker BUILD stage, imports resolve through the pnpm
 * workspace root, so an undeclared dependency type-checks and compiles clean.
 * The runtime image is different: Dockerfile.build synthesises a manifest from
 * this package's dependencies unioned with erxes-api-shared's, installs only
 * that, and copies it into a bare node:22-alpine. Anything not declared is
 * simply absent, and the container crash-loops on MODULE_NOT_FOUND.
 *
 * That is exactly what happened on the first deploy of this plugin: the
 * create-plugin generator emits a manifest declaring only erxes-api-shared,
 * while the generated code itself imports graphql-tag. The plugin crash-looped,
 * and because the gateway gates on it being healthy, core-ui and the gateway
 * stayed in `created` — a whole-stack outage from one missing line.
 *
 * Run: node scripts/verify-runtime-deps.cjs
 */

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

// Node built-ins ship with the runtime; path aliases (~/ and @/) and relative
// imports resolve inside our own dist and are not packages.
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

const collect = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });

const IMPORT_RE = /(?:from\s+|require\()\s*['"]([^'"]+)['"]/g;

const missing = new Map();
let scanned = 0;

for (const file of collect(path.join(root, 'src'))) {
  scanned++;
  const source = fs.readFileSync(file, 'utf8');

  for (const [, spec] of source.matchAll(IMPORT_RE)) {
    if (spec.startsWith('.') || spec.startsWith('~') || spec.startsWith('@/')) {
      continue;
    }

    // Scoped packages keep two segments (@scope/name); everything else keeps
    // one, so a deep import like 'mongoose/lib/x' still maps to 'mongoose'.
    const name = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0];

    if (builtins.has(name) || declared.has(name)) continue;

    if (!missing.has(name)) missing.set(name, []);
    missing.get(name).push(path.relative(root, file));
  }
}

console.log(`scanned ${scanned} source files in calcom_api/src`);

if (missing.size) {
  console.error('\nUNDECLARED RUNTIME DEPENDENCIES:');
  for (const [name, files] of missing) {
    console.error(`  - ${name}`);
    for (const f of files.slice(0, 3)) console.error(`      ${f}`);
    if (files.length > 3) console.error(`      … and ${files.length - 3} more`);
  }
  console.error(
    '\nThese compile locally but will be ABSENT from the runtime image.',
  );
  process.exit(1);
}

console.log('all external imports are declared in package.json');
