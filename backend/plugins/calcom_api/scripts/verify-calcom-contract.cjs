#!/usr/bin/env node
/**
 * Checks this plugin's Cal.com client against Cal.com's own OpenAPI spec.
 *
 * Why this exists: every mistake this catches fails SILENTLY at runtime.
 * Cal.com's DTOs strip unknown properties, so a misnamed field returns 200
 * having done nothing, and `cal-api-version` selects a response SHAPE, so the
 * wrong date parses as a data-mapping bug rather than an API error. Three such
 * bugs were found by hand when the client was first written:
 *
 *   - mark-absent takes `host`, not `noShowHost` (the webhook uses noShowHost
 *     for the same concept, which is how the confusion starts)
 *   - /slots requires cal-api-version 2024-09-04, not the bookings 2024-08-13
 *   - /event-types requires 2024-06-14
 *
 * Run against a checkout of the cal.com fork:
 *   node scripts/verify-calcom-contract.cjs /path/to/calcom-preprivate
 *
 * Skips (exit 0) when the spec is not present, so it is safe in CI that does
 * not check out the calendar repo.
 */

const fs = require('fs');
const path = require('path');

const calcomRepo =
  process.argv[2] || '/home/shivam/Hypedrive/vendor/calcom-preprivate';
const specPath = path.join(calcomRepo, 'docs/api-reference/v2/openapi.json');

if (!fs.existsSync(specPath)) {
  console.log(`skip: no OpenAPI spec at ${specPath}`);
  process.exit(0);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const clientPath = path.join(__dirname, '../src/modules/bookings/calcomApi.ts');
const client = fs.readFileSync(clientPath, 'utf8');

const failures = [];
const checks = [];

const check = (name, ok, detail) => {
  checks.push(name);
  if (!ok) failures.push(`${name}: ${detail}`);
};

// 1. Every endpoint the client calls must exist with that method.
const ENDPOINTS = [
  ['/v2/bookings', 'post'],
  ['/v2/bookings', 'get'],
  ['/v2/bookings/{bookingUid}/cancel', 'post'],
  ['/v2/bookings/{bookingUid}/reschedule', 'post'],
  ['/v2/bookings/{bookingUid}/mark-absent', 'post'],
  ['/v2/bookings/{bookingUid}/confirm', 'post'],
  ['/v2/bookings/{bookingUid}/decline', 'post'],
  ['/v2/event-types', 'get'],
  ['/v2/slots', 'get'],
];

for (const [route, method] of ENDPOINTS) {
  check(
    `${method.toUpperCase()} ${route}`,
    !!spec.paths?.[route]?.[method],
    'not present in the spec — endpoint moved or was removed',
  );
}

// 2. cal-api-version is required per endpoint and selects the response shape,
//    so the client must send the version each endpoint actually expects.
const versionFor = (route, method) => {
  const params = spec.paths?.[route]?.[method]?.parameters || [];
  const p = params.find((x) => x.name === 'cal-api-version');
  return p?.schema?.example || p?.schema?.default;
};

const VERSION_CONSTANTS = {
  API_VERSION_BOOKINGS: versionFor('/v2/bookings', 'post'),
  API_VERSION_SLOTS: versionFor('/v2/slots', 'get'),
  API_VERSION_EVENT_TYPES: versionFor('/v2/event-types', 'get'),
};

for (const [constant, expected] of Object.entries(VERSION_CONSTANTS)) {
  if (!expected) continue;

  const declared = new RegExp(`${constant}\\s*=\\s*'([^']+)'`).exec(client);

  check(
    `${constant} === ${expected}`,
    declared?.[1] === expected,
    `client declares ${declared?.[1] ?? 'nothing'}, spec expects ${expected}`,
  );
}

// 3. mark-absent field names. This is the one that fails silently.
const markAbsent =
  spec.components?.schemas?.MarkAbsentBookingInput_2024_08_13?.properties;

if (markAbsent) {
  check(
    'mark-absent sends `host`',
    Object.keys(markAbsent).includes('host') && /\bhost:\s/.test(client),
    'spec field is `host`; sending `noShowHost` is accepted and ignored',
  );
}

console.log(`checked ${checks.length} contract points against ${specPath}`);

if (failures.length) {
  console.error('\nCONTRACT MISMATCH:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('client matches the Cal.com v2 spec');
