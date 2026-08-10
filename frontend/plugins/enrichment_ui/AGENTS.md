# `enrichment_ui` Plugin Guide

## Identity

- **Plugin:** `enrichment`
- **Project:** `enrichment_ui`
- **Layer:** `Frontend UI`
- **Path:** `frontend/plugins/enrichment_ui`
- **Last synchronized:** `2026-08-10`

## Scope

### Owns

- The **Enrichment** tab on the contact detail panel — the button that runs a
  provider against the open contact, and the history of past attempts.
- The Settings → Enrichment screen where provider API keys are entered.
- This plugin's GraphQL documents and hooks.

### Does not own

- The contact detail page itself. It is core-ui's, and this plugin reaches it
  only through the `relationWidgets` extension point.
- Customer fields and the properties tab — enrichment results appear there
  because `enrichment_api` writes them, not because this plugin renders them.
- Any provider logic. Every API call happens server-side; keys never reach the
  browser.

## Current Capabilities

- Lists all four providers with per-record state: configured or not, usable on
  this record or not, and why not.
- Runs one provider on the open contact and reports the outcome — found,
  no match, skipped, or failed.
- Shows the recent attempt history, so an operator can see that a provider has
  already missed rather than pressing again and spending another credit.
- Stores API keys per workspace; values are write-only and never read back.

## Architecture

| Area          | Path                                            | Responsibility                                       |
| ------------- | ----------------------------------------------- | ---------------------------------------------------- |
| Plugin config | `src/config.tsx`                                | Declares the `providers` module and its relation widget |
| MF exposes    | `module-federation.config.ts`                   | `./relationWidget` — the name core-ui loads           |
| Widget host   | `src/widgets/Widgets.tsx`                       | Resolves the customer id from the host's props        |
| Panel         | `src/modules/enrichment/components/EnrichmentPanel.tsx` | Provider list, buttons, history            |
| Hooks         | `src/modules/enrichment/hooks/useEnrichment.ts` | Queries, mutation, refetch and toasts                 |
| Documents     | `src/modules/enrichment/graphql/`               | Queries and mutations                                 |
| Settings      | `src/modules/EnrichmentSettings.tsx`            | API key entry                                         |

## Contracts

### Provides

- Relation widget `providers`, labelled **Enrichment**, on any record that
  carries a customer.

### Consumes

- `enrichment_api`: `enrichmentProviders`, `enrichmentLogs`,
  `enrichmentConfigStatus`, `enrichCustomer`, `enrichmentSetConfig`.
- `ui-modules`: `IRelationWidgetProps`, `PageHeader`,
  `createFavoriteBreadcrumb`.

## Data and State

- No Jotai state. Everything server-side lives in Apollo; the only local state
  is which provider button is currently running, and the unsaved settings
  inputs.
- After an enrichment the provider list and the log are refetched rather than
  patched: a hit changes the customer's own fields, which both are derived
  from, and the shapes differ enough that hand-written cache updates would be
  the more fragile choice.

## Local Invariants

- **The expose must be named `./relationWidget`.** core-ui loads contact widgets
  through `RenderPluginsComponent` with that exact remote module name. The
  generator emits `./widgets`, under which the tab renders empty with no error
  anywhere — calcom_ui hit this first.
- **`relationWidgets` in `config.tsx` is also required.**
  `useRelationWidgetsModules` builds the tab list from that array; the expose
  alone means nothing ever requests the component.
- **`hasRelationWidget: true` on the module.** Without it the module is not
  offered to the tab list at all.
- **API keys never reach the browser.** The settings screen reads only whether a
  key is set and where it came from; inputs start empty and a blank save clears
  the stored value.
- **Dev port 3012.** 3005 is the generator's default and is already taken by
  calcom_ui and sales_ui.

## Validation

- `pnpm nx lint enrichment_ui`
- `pnpm nx build enrichment_ui`
- `npx tsc --noEmit -p frontend/plugins/enrichment_ui/tsconfig.app.json`
- Smoke: open a contact, switch to the Enrichment tab, confirm every provider
  is listed with a reason when disabled, and that pressing Enrich produces a
  toast and a history row.

## Recent Changes

<!-- Newest first. Keep at most 10 entries. -->

### `2026-08-10` — Plugin created

- **Summary:** Adds the Enrichment tab on contacts and the provider key
  settings screen.
- **Affected areas:** whole plugin.
- **Contracts changed:** None existing. Consumes the new `enrichment_api`
  GraphQL surface.
