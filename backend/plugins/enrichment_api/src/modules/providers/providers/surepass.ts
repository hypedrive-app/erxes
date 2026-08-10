import { getEnv } from 'erxes-api-shared/utils';

import {
  TEnrichmentInput,
  TEnrichmentProvider,
  TEnrichmentResult,
} from '@/providers/@types/providers';

const DEFAULT_BASE_URL = 'https://kyc-api.surepass.io/api/v1';

/**
 * Surepass — Indian statutory company data (GSTIN, DIN).
 *
 * Different in kind from Surfe/Apollo/Hunter: those find a PERSON from a name,
 * this looks up a REGISTERED ENTITY from a government identifier. It cannot
 * guess — given a GSTIN it returns the filed record, and given nothing it can
 * do nothing. That is why canHandle is a strict identifier check rather than a
 * best-effort one.
 *
 * Verified against the live API on 2026-08-10 with this deployment's token:
 *   corporate/gstin-advanced -> 403 balance_exhausted   (in scope, no credits)
 *   corporate/din            -> 401 invalid_token       (NOT in this plan)
 * Both paths are implemented so that enabling either upstream is a Surepass
 * account change, not a code change.
 *
 * Error shape is uniform: {success, status_code, message, message_code}.
 * Notably the balance check runs BEFORE input validation, so an exhausted
 * account reports 403 even for a malformed id.
 */

const surepassRequest = async (
  path: string,
  idNumber: string,
  apiKey: string,
) => {
  const baseUrl = getEnv({
    name: 'SUREPASS_BASE_URL',
    defaultValue: DEFAULT_BASE_URL,
  });

  const response = await fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ id_number: idNumber }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || body?.success === false) {
    // message_code carries the actionable distinction — 'balance_exhausted'
    // means recharge, 'invalid_token' means the plan lacks this endpoint.
    // Surfacing it verbatim is what lets the operator tell those apart.
    throw new Error(
      `Surepass (${body?.message_code || response.status}): ${
        body?.message || 'request failed'
      }`,
    );
  }

  return body?.data || null;
};

export const surepassProvider: TEnrichmentProvider = {
  key: 'surepass',
  label: 'Surepass (GSTIN / DIN)',

  // A statutory identifier is the only usable input. `gstin` and `din` ride on
  // the shared input type's optional fields rather than widening it for one
  // provider.
  canHandle: (input: TEnrichmentInput) =>
    Boolean(input.gstin || input.din),

  enrich: async (
    input: TEnrichmentInput,
    apiKey: string,
  ): Promise<TEnrichmentResult | null> => {
    if (input.gstin) {
      const data = await surepassRequest(
        'corporate/gstin-advanced',
        input.gstin,
        apiKey,
      );

      if (!data) {
        return null;
      }

      return {
        companyName:
          data.business_name || data.legal_name || data.trade_name || undefined,
        companyIndustry: data.nature_of_business_activities?.[0] || undefined,
        location:
          data.address ||
          [data.pradr?.addr?.city, data.pradr?.addr?.stcd]
            .filter(Boolean)
            .join(', ') ||
          undefined,
        raw: data,
      };
    }

    if (input.din) {
      const data = await surepassRequest('corporate/din', input.din, apiKey);

      if (!data) {
        return null;
      }

      return {
        // A DIN lookup identifies a DIRECTOR — so the person-shaped fields are
        // the meaningful ones here, and the company fields describe where they
        // hold that directorship.
        jobTitle: 'Director',
        companyName: data.company_list?.[0]?.company_name || undefined,
        location: data.address || undefined,
        raw: data,
      };
    }

    return null;
  },
};
