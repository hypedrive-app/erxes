import {
  TEnrichmentInput,
  TEnrichmentProvider,
  TEnrichmentResult,
} from '@/providers/@types/providers';

const BASE_URL = 'https://api.hunter.io/v2';

/**
 * Hunter.io — email finder.
 *
 * Narrower than the other two on purpose: Hunter's model is "given a person and
 * where they work, guess and verify their work email". It returns a title and
 * a confidence score alongside, but it is not a full B2B profile lookup.
 *
 * Auth is a QUERY PARAMETER, not a header — Hunter documents header variants
 * but its own examples use `?api_key=`, and that is the form that is certain to
 * work.
 */
export const hunterProvider: TEnrichmentProvider = {
  key: 'hunter',
  label: 'Hunter.io',

  /**
   * Needs a name plus somewhere to look. `company` is accepted in place of
   * `domain`, which matters here: most of our records have a company name and
   * no domain.
   */
  canHandle: (input: TEnrichmentInput) => {
    const hasName = Boolean(
      input.fullName || (input.firstName && input.lastName),
    );

    return hasName && Boolean(input.domain || input.companyName);
  },

  enrich: async (
    input: TEnrichmentInput,
    apiKey: string,
  ): Promise<TEnrichmentResult | null> => {
    const params = new URLSearchParams({ api_key: apiKey });

    if (input.domain) {
      params.set('domain', input.domain);
    } else if (input.companyName) {
      params.set('company', input.companyName);
    }

    if (input.firstName && input.lastName) {
      params.set('first_name', input.firstName);
      params.set('last_name', input.lastName);
    } else if (input.fullName) {
      params.set('full_name', input.fullName);
    }

    const response = await fetch(`${BASE_URL}/email-finder?${params}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Hunter's documented failures: 400 bad params, 401 bad key, 403 rate
      // limit, 429 monthly quota, 451 GDPR-removed. All arrive as
      // {errors:[{id,code,details}]}.
      const detail =
        body?.errors?.[0]?.details || body?.errors?.[0]?.id || response.status;

      throw new Error(`Hunter: ${detail}`);
    }

    const data = body?.data;

    // A genuine miss: Hunter answers 200 with a null email rather than an
    // error. Returning null keeps that distinct from a failure.
    if (!data?.email) {
      return null;
    }

    return {
      email: data.email,
      phone: data.phone_number || undefined,
      jobTitle: data.position || undefined,
      linkedinUrl: data.linkedin_url || undefined,
      companyName: data.company || undefined,
      companyDomain: data.domain || undefined,
      // Hunter scores 0-100; the rest of this plugin works in 0..1.
      confidence:
        typeof data.score === 'number' ? data.score / 100 : undefined,
      raw: data,
    };
  },
};
