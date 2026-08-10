# `enrichment_api` Plugin Guide

## Identity

- **Plugin:** `enrichment`
- **Project:** `enrichment_api`
- **Layer:** `Backend API`
- **Path:** `backend/plugins/enrichment_api`
- **Last synchronized:** `2026-08-10`

## Scope

### Owns

- Third-party contact/company data provider integrations: Surfe, Apollo.io,
  Hunter.io and Surepass (GSTIN / DIN).
- Per-tenant provider API keys (`enrichment_configs`).
- An audit row for every enrichment attempt (`enrichment_logs`).
- The custom field definitions enrichment results are written into.

### Does not own

- Customers and Companies — core-owned. This plugin reads them and writes back
  through core's `customers` tRPC router; it never models or queries them
  directly.
- The custom-field system itself. Fields are created through core's `fields`
  tRPC router; their storage and validation stay core's.
- Any UI. `enrichment_ui` owns the widget and the settings screen.

## Current Capabilities

- Enriches one customer with one named provider, on demand.
- Four providers behind a single `TEnrichmentProvider` interface:
  - **Hunter.io** — name + (domain or company) → work email, title, score.
    Synchronous. Auth is a `?api_key=` query parameter.
  - **Apollo.io** — name (better with company/domain), email or LinkedIn URL →
    email, title, seniority, company facts. Synchronous, `x-api-key` header.
    Returns HTTP 200 on a miss, so the body must be inspected.
  - **Surfe** — LinkedIn URL, or name + company → contact details and role.
    **Asynchronous**: POST starts a job, a second endpoint is polled. The start
    call is v2 and the poll call is v1.
  - **Surepass** — GSTIN or DIN → registered entity data. Cannot guess; a
    statutory identifier is required.
- Asks each provider whether it has enough input BEFORE spending a credit.
- Registers its own custom fields on first use, per tenant.
- Records every attempt as `hit`, `miss`, `skipped` or `error`.

## Architecture

| Area              | Path                                        | Responsibility                                                        |
| ----------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Bootstrap         | `src/main.ts`                               | `startPlugin({ name: 'enrichment', port: 3315 })`; puts `subdomain` on the Apollo context |
| Models            | `src/connectionResolvers.ts`                | `EnrichmentConfigs`, `EnrichmentLogs`                                  |
| Provider contract | `src/modules/providers/@types/providers.ts` | `TEnrichmentProvider`, input and result shapes                         |
| Providers         | `src/modules/providers/providers/`          | One module per provider plus the registry in `index.ts`                |
| Config            | `src/modules/providers/config.ts`           | DB-first key resolution, provider → config code map                    |
| Fields            | `src/modules/providers/fields.ts`           | Registers custom fields and resolves code → field id                   |
| Orchestration     | `src/modules/providers/enrichService.ts`    | Builds input, runs a provider, writes back, logs the outcome           |
| GraphQL           | `src/modules/providers/graphql/`            | `enrichmentProviders`, `enrichmentLogs`, `enrichCustomer`, `enrichmentSetConfig` |

## Contracts

### Provides

- `enrichmentProviders(customerId: String): [EnrichmentProvider]` — per-provider
  `isConfigured` and `canHandle` for one record.
- `enrichmentConfigStatus: [EnrichmentConfigStatus]`
- `enrichmentLogs(contentType, contentId): [EnrichmentLog]`
- `enrichCustomer(customerId, provider, overrides): EnrichmentOutcome`
- `enrichmentSetConfig(code, value): EnrichmentConfigStatus`

### Consumes

- core tRPC `customers.findOne` / `customers.updateCustomer`
- core tRPC `fields.find` / `fields.create`

## Data and State

- `enrichment_configs` — one row per provider key. An empty value DELETES the
  row so the environment default becomes visible again.
- `enrichment_logs` — append-only, newest 20 shown per record.
- Results land on the core Customer: `propertiesData` for the enrichment fields,
  plus `primaryEmail` / `primaryPhone` **only when those are empty**.

## Local Invariants

- **Custom fields must exist before any write.** Core validates
  `propertiesData` against the registered field list and silently DROPS unknown
  keys — verified live: writing an unregistered key returns success with the key
  absent from the stored document. `ensureEnrichmentFields` runs on every
  enrichment, not once at boot, because tenants and fields both appear later.
- **`propertiesData` is keyed by field `_id`, not by code.** Ids differ per
  tenant, so the code → id map is resolved at write time.
- **Never overwrite an existing email or phone.** An enrichment guess must not
  displace an address a human entered or a customer actually used.
- **`canHandle` must stay pure and offline.** The UI calls it to decide button
  state; a network call there would make rendering a record cost money.
- **A miss is not an error.** Providers return `null` for "ran, found nothing";
  only a genuine fault throws. Conflating them makes normal outcomes look like
  outages.
- **Port 3315.** 33010 is the generator's default and `insurance_api` already
  claims it.

## Validation

- `pnpm nx lint enrichment_api`
- `pnpm nx build enrichment_api`
- `npx tsc --noEmit -p backend/plugins/enrichment_api/tsconfig.json`
- Smoke: configure one provider key, open a customer with a name and company,
  press Enrich, and confirm a row appears in `enrichment_logs` and the fields
  show on the properties tab.

## Recent Changes

<!-- Newest first. Keep at most 10 entries. -->

### `2026-08-10` — Plugin created

- **Summary:** New plugin providing on-demand contact enrichment from Surfe,
  Apollo, Hunter and Surepass, written back onto core Customer records.
- **Affected areas:** whole plugin.
- **Contracts changed:** None existing; adds the GraphQL surface listed above.
  First caller in this repo of core's `customers.updateCustomer` tRPC procedure.
