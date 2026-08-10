import { sendTRPCMessage } from 'erxes-api-shared/utils';

/**
 * Custom fields this plugin writes enrichment results into.
 *
 * These MUST exist before any write. Core validates propertiesData against the
 * registered field list and silently DROPS unknown keys — verified against the
 * live deployment: writing an unregistered key returned success with the key
 * absent from the stored document. Without this registration every enrichment
 * would appear to work and persist nothing.
 *
 * `code` is the stable handle. Core keys propertiesData by field _id, so the
 * plugin resolves code -> _id at write time rather than hardcoding ids that
 * differ per tenant.
 */
export const ENRICHMENT_FIELDS = [
  { code: 'enrichment_job_title', text: 'Job title', type: 'input' },
  { code: 'enrichment_seniority', text: 'Seniority', type: 'input' },
  { code: 'enrichment_linkedin', text: 'LinkedIn URL', type: 'input' },
  { code: 'enrichment_company_name', text: 'Company', type: 'input' },
  { code: 'enrichment_company_domain', text: 'Company domain', type: 'input' },
  { code: 'enrichment_company_size', text: 'Company size', type: 'input' },
  { code: 'enrichment_company_industry', text: 'Industry', type: 'input' },
  { code: 'enrichment_location', text: 'Location', type: 'input' },
  { code: 'enrichment_source', text: 'Enriched by', type: 'input' },
  { code: 'enrichment_date', text: 'Enriched on', type: 'input' },
] as const;

export type TEnrichmentFieldCode = (typeof ENRICHMENT_FIELDS)[number]['code'];

const findFields = async (subdomain: string, contentType: string) =>
  (await sendTRPCMessage({
    subdomain,
    pluginName: 'core',
    module: 'fields',
    action: 'find',
    method: 'query',
    input: { query: { contentType } },
    defaultValue: [],
  })) as Array<{ _id: string; code?: string }>;

/**
 * Creates any missing field, then returns code -> _id for the whole set.
 *
 * Idempotent: run on every enrichment rather than only at boot, because a
 * tenant created after the plugin started would otherwise never get them, and
 * an operator can delete a field from the properties screen at any time.
 */
export const ensureEnrichmentFields = async (
  subdomain: string,
  contentType: string,
): Promise<Record<string, string>> => {
  const existing = await findFields(subdomain, contentType);
  const byCode = new Map(
    existing.filter((f) => f.code).map((f) => [f.code as string, f._id]),
  );

  const missing = ENRICHMENT_FIELDS.filter((f) => !byCode.has(f.code));

  for (const field of missing) {
    const created = (await sendTRPCMessage({
      subdomain,
      pluginName: 'core',
      module: 'fields',
      action: 'create',
      method: 'mutation',
      input: {
        contentType,
        code: field.code,
        text: field.text,
        type: field.type,
        // Marks the field as ours rather than a stock erxes one, which is what
        // keeps it editable and removable by an operator.
        isDefinedByErxes: false,
      },
      defaultValue: null,
    })) as { _id?: string } | null;

    if (created?._id) {
      byCode.set(field.code, created._id);
    }
  }

  return Object.fromEntries(byCode);
};
