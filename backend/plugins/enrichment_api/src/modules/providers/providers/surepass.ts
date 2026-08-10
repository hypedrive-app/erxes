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
 * Endpoint choice comes from probing this deployment's own token on
 * 2026-08-10, not from the docs — 403 means the endpoint is in the plan and
 * only out of credits, 401 means the plan does not include it, 404 means it
 * does not exist:
 *   corporate/gstin-advanced -> 403  in plan, needs a recharge
 *   corporate/director-phone -> 403  in plan, needs a recharge
 *   corporate/din            -> 401  NOT in this plan
 *   corporate/din-search     -> 401  NOT in this plan
 *   corporate/company-details, corporate/cin -> 401
 *   director-details, director-list, din-advanced, din-basic,
 *   llpin, company-din, din-to-company, mca-company -> 404, no such endpoint
 *
 * So DIN lookups use director-phone rather than the more obvious
 * corporate/din: one recharge enables both of the endpoints this plugin needs,
 * where corporate/din would additionally require Surepass to widen the plan.
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
      const data = await surepassRequest(
        'corporate/director-phone',
        input.din,
        apiKey,
      );

      if (!data) {
        return null;
      }

      // Response keys are read defensively. Surepass's technical reference is
      // behind their console login, and this account's balance check runs
      // BEFORE input validation — a live probe answers 403 whatever the body
      // is, so the exact shape could not be confirmed from either docs or a
      // real call. Several plausible spellings are tried and `raw` keeps the
      // untouched payload, so the first successful call after a recharge shows
      // what the real keys are without losing the result.
      const phone =
        data.phone_number ||
        data.mobile ||
        data.phone ||
        data.contact_number ||
        data.phone_numbers?.[0] ||
        undefined;

      const name =
        data.director_name || data.name || data.full_name || undefined;

      // A DIN identifies a DIRECTOR, so the person-shaped fields carry the
      // meaning here and the company fields describe where they hold that
      // directorship.
      return {
        phone,
        email: data.email || undefined,
        jobTitle: 'Director',
        companyName:
          data.company_list?.[0]?.company_name ||
          data.company_name ||
          undefined,
        location: data.address || undefined,
        raw: { ...data, ...(name ? { resolvedName: name } : {}) },
      };
    }

    return null;
  },
};
