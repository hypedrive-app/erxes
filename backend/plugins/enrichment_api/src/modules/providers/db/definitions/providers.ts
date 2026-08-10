import { Schema } from 'mongoose';

import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * Per-tenant provider credentials.
 *
 * A collection rather than the core `configs` collection because those keys are
 * core-owned and tenant-global; a plugin writing its own secrets there would be
 * reaching outside its boundary. Mirrors calcom's CalcomConfigs.
 */
export const enrichmentConfigSchema = new Schema(
  {
    _id: mongooseStringRandomId,
    code: {
      type: String,
      unique: true,
      label: 'Config code (e.g. HUNTER_API_KEY)',
    },
    value: { type: String, label: 'Value' },
  },
  { timestamps: true },
);

/**
 * One row per enrichment attempt.
 *
 * Kept because enrichment spends money: every call costs a provider credit, and
 * without a record there is no way to answer "why does this customer have a
 * Hunter email from three weeks ago", to avoid re-querying a record that
 * already missed, or to reconcile a provider invoice.
 *
 * `result` stores what was written, not the raw provider payload — the raw
 * response can contain data we deliberately chose not to persist.
 */
export const enrichmentLogSchema = new Schema(
  {
    _id: mongooseStringRandomId,
    contentType: {
      type: String,
      index: true,
      label: 'core:customer or core:company',
    },
    contentId: { type: String, index: true, label: 'Record enriched' },
    provider: { type: String, index: true, label: 'surfe|apollo|hunter|surepass' },
    // 'hit' — provider returned data. 'miss' — ran fine, found nothing.
    // 'skipped' — not enough input, no call made, no credit spent.
    // 'error' — the call itself failed.
    outcome: { type: String, index: true, label: 'hit|miss|skipped|error' },
    // What we sent, so a bad result can be explained without guessing.
    input: { type: Schema.Types.Mixed, label: 'Input sent to the provider' },
    result: { type: Schema.Types.Mixed, label: 'Fields written back' },
    errorMessage: { type: String, optional: true, label: 'Failure reason' },
    userId: { type: String, optional: true, label: 'Who pressed the button' },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);
