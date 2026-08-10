import { sendTRPCMessage } from 'erxes-api-shared/utils';

import { IModels } from '~/connectionResolvers';
import {
  TEnrichmentInput,
  TEnrichmentResult,
} from '@/providers/@types/providers';
import { getEnrichmentConfig, PROVIDER_CONFIG_CODE } from '@/providers/config';
import { ensureEnrichmentFields } from '@/providers/fields';
import { getProvider } from '@/providers/providers';

export type TEnrichOutcome = {
  outcome: 'hit' | 'miss' | 'skipped' | 'error';
  provider: string;
  message?: string;
  written?: Record<string, string>;
  result?: TEnrichmentResult;
};

const readCustomer = async (subdomain: string, customerId: string) =>
  (await sendTRPCMessage({
    subdomain,
    pluginName: 'core',
    module: 'customers',
    action: 'findOne',
    method: 'query',
    input: { _id: customerId },
    defaultValue: null,
  })) as Record<string, any> | null;

/**
 * Builds provider input from whatever the customer record holds.
 *
 * Deliberately lossy about where a value came from: a provider only needs the
 * value, and the enrichment fields we previously wrote are as valid an input as
 * the record's own columns — an earlier Hunter hit that found a company can let
 * a later Apollo call succeed.
 */
const buildInput = (
  customer: Record<string, any>,
  fieldIds: Record<string, string>,
  overrides?: TEnrichmentInput,
): TEnrichmentInput => {
  const props = customer.propertiesData || {};
  const prop = (code: string) => {
    const id = fieldIds[code];
    return id ? props[id] : undefined;
  };

  const firstName = customer.firstName || undefined;
  const lastName = customer.lastName || undefined;

  return {
    firstName,
    lastName,
    fullName:
      [firstName, lastName].filter(Boolean).join(' ').trim() || undefined,
    email: customer.primaryEmail || customer.emails?.[0] || undefined,
    phone: customer.primaryPhone || customer.phones?.[0] || undefined,
    companyName: prop('enrichment_company_name') || undefined,
    domain: prop('enrichment_company_domain') || undefined,
    linkedinUrl: prop('enrichment_linkedin') || undefined,
    // Overrides let the operator type a domain or a GSTIN into the widget for
    // a record that has none — which is the difference between "this provider
    // cannot run" and "give it the one thing it needs".
    ...(overrides || {}),
  };
};

/**
 * Maps a provider result onto field codes. Only keys the provider actually
 * returned are included, so a partial hit never blanks a field that a previous
 * enrichment filled in.
 */
const toFieldValues = (
  result: TEnrichmentResult,
  provider: string,
): Record<string, string> => {
  const values: Record<string, string> = {};

  const set = (code: string, value?: string) => {
    if (value) values[code] = value;
  };

  set('enrichment_job_title', result.jobTitle);
  set('enrichment_seniority', result.seniority);
  set('enrichment_linkedin', result.linkedinUrl);
  set('enrichment_company_name', result.companyName);
  set('enrichment_company_domain', result.companyDomain);
  set('enrichment_company_size', result.companySize);
  set('enrichment_company_industry', result.companyIndustry);
  set('enrichment_location', result.location);
  set('enrichment_source', provider);
  set('enrichment_date', new Date().toISOString().slice(0, 10));

  return values;
};

/**
 * Enriches one customer with one provider.
 *
 * Every path writes an audit row, because each call may spend a paid credit and
 * "why does this record say Apollo" is otherwise unanswerable.
 */
export const enrichCustomer = async ({
  models,
  subdomain,
  customerId,
  providerKey,
  overrides,
  userId,
}: {
  models: IModels;
  subdomain: string;
  customerId: string;
  providerKey: string;
  overrides?: TEnrichmentInput;
  userId?: string;
}): Promise<TEnrichOutcome> => {
  const provider = getProvider(providerKey);
  const contentType = 'core:customer';

  const apiKey = await getEnrichmentConfig(
    models,
    PROVIDER_CONFIG_CODE[providerKey],
  );

  if (!apiKey) {
    const message = `${provider.label} has no API key configured`;
    await models.EnrichmentLogs.record({
      contentType,
      contentId: customerId,
      provider: providerKey,
      outcome: 'skipped',
      errorMessage: message,
      userId,
    });
    return { outcome: 'skipped', provider: providerKey, message };
  }

  const customer = await readCustomer(subdomain, customerId);

  if (!customer) {
    throw new Error('Customer not found');
  }

  const fieldIds = await ensureEnrichmentFields(subdomain, contentType);
  const input = buildInput(customer, fieldIds, overrides);

  // Asked before spending anything: with most records carrying only a name,
  // this is the common outcome and must not cost a credit.
  if (!provider.canHandle(input)) {
    const message = `Not enough information for ${provider.label}`;
    await models.EnrichmentLogs.record({
      contentType,
      contentId: customerId,
      provider: providerKey,
      outcome: 'skipped',
      input,
      errorMessage: message,
      userId,
    });
    return { outcome: 'skipped', provider: providerKey, message };
  }

  let result: TEnrichmentResult | null;

  try {
    result = await provider.enrich(input, apiKey);
  } catch (e) {
    const message = (e as Error).message;
    await models.EnrichmentLogs.record({
      contentType,
      contentId: customerId,
      provider: providerKey,
      outcome: 'error',
      input,
      errorMessage: message,
      userId,
    });
    return { outcome: 'error', provider: providerKey, message };
  }

  if (!result) {
    await models.EnrichmentLogs.record({
      contentType,
      contentId: customerId,
      provider: providerKey,
      outcome: 'miss',
      input,
      userId,
    });
    return {
      outcome: 'miss',
      provider: providerKey,
      message: `${provider.label} found no match`,
    };
  }

  const values = toFieldValues(result, providerKey);

  // propertiesData is keyed by field _id, and is written whole — merging with
  // what is already there so enriching with a second provider adds to the
  // record rather than replacing the first provider's findings.
  const propertiesData = { ...(customer.propertiesData || {}) };

  for (const [code, value] of Object.entries(values)) {
    const id = fieldIds[code];
    if (id) propertiesData[id] = value;
  }

  const doc: Record<string, unknown> = { propertiesData };

  // Email and phone are first-class columns, not properties. Only filled when
  // empty: an enrichment guess must never overwrite an address a human entered
  // or that the customer themselves used to contact us.
  if (result.email && !customer.primaryEmail) {
    doc.primaryEmail = result.email;
  }

  if (result.phone && !customer.primaryPhone) {
    doc.primaryPhone = result.phone;
  }

  await sendTRPCMessage({
    subdomain,
    pluginName: 'core',
    module: 'customers',
    action: 'updateCustomer',
    method: 'mutation',
    input: { _id: customerId, doc },
    throwOnFailure: true,
  });

  await models.EnrichmentLogs.record({
    contentType,
    contentId: customerId,
    provider: providerKey,
    outcome: 'hit',
    input,
    result: {
      ...values,
      ...(doc.primaryEmail ? { email: doc.primaryEmail } : {}),
      // The provider's untouched payload, recorded only on a hit.
      //
      // Kept because a provider whose response shape we could not confirm up
      // front — Surepass's reference is behind their console login — otherwise
      // gives no way to tell "the key we read is wrong" from "there was no
      // data". With this, the first successful call shows the real shape and
      // the mapping can be tightened against it instead of guessed again.
      //
      // Only on a hit: a miss has nothing to inspect, and errors already carry
      // their message.
      ...(result.raw ? { providerPayload: result.raw } : {}),
    },
    userId,
  });

  return {
    outcome: 'hit',
    provider: providerKey,
    written: values,
    result,
  };
};
