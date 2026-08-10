import {
  TEnrichmentInput,
  TEnrichmentProvider,
  TEnrichmentResult,
} from '@/providers/@types/providers';

const BASE_URL = 'https://api.apollo.io/api/v1';

/**
 * Apollo.io — B2B people database.
 *
 * The broadest of the three: it will attempt a match from a name alone, though
 * accuracy climbs sharply with a company or domain alongside.
 *
 * Two things about this API are easy to get wrong:
 *
 * 1. The path is `/api/v1/...`, not `/v1/...`. Older examples on the web use
 *    the shorter form.
 * 2. A MISS RETURNS HTTP 200 with no person on the body. Status code alone
 *    cannot distinguish "found nothing" from "worked" — the body has to be
 *    inspected, which is what the `person?.id` check below is for.
 *
 * `reveal_personal_emails` and `reveal_phone_number` are deliberately NOT set.
 * Personal emails cost extra credits and are a different privacy posture from
 * work contact details; phone reveal is additionally asynchronous (it needs a
 * webhook_url and answers later), which does not fit a button that must return
 * a result to the person who pressed it.
 */
export const apolloProvider: TEnrichmentProvider = {
  key: 'apollo',
  label: 'Apollo.io',

  canHandle: (input: TEnrichmentInput) =>
    Boolean(
      input.email ||
        input.linkedinUrl ||
        input.fullName ||
        (input.firstName && input.lastName),
    ),

  enrich: async (
    input: TEnrichmentInput,
    apiKey: string,
  ): Promise<TEnrichmentResult | null> => {
    const payload: Record<string, string> = {};

    if (input.email) payload.email = input.email;
    if (input.linkedinUrl) payload.linkedin_url = input.linkedinUrl;
    if (input.firstName) payload.first_name = input.firstName;
    if (input.lastName) payload.last_name = input.lastName;
    if (!input.firstName && input.fullName) payload.name = input.fullName;
    if (input.companyName) payload.organization_name = input.companyName;
    if (input.domain) payload.domain = input.domain;

    const response = await fetch(`${BASE_URL}/people/match`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Apollo: ${body?.error || body?.message || response.status}`,
      );
    }

    const person = body?.person;

    // The 200-on-miss case documented above.
    if (!person?.id) {
      return null;
    }

    const org = person.organization || {};

    return {
      email: person.email || undefined,
      phone: person.phone_numbers?.[0]?.sanitized_number || undefined,
      jobTitle: person.title || undefined,
      seniority: person.seniority || undefined,
      linkedinUrl: person.linkedin_url || undefined,
      companyName: org.name || undefined,
      companyDomain: org.primary_domain || undefined,
      companyIndustry: org.industry || undefined,
      companySize: org.estimated_num_employees
        ? String(org.estimated_num_employees)
        : undefined,
      location: [person.city, person.state, person.country]
        .filter(Boolean)
        .join(', ') || undefined,
      // Apollo reports email_status (verified/guessed/unavailable) rather than
      // a numeric score. Mapped so downstream code has one comparable scale
      // across providers instead of a per-provider special case.
      confidence:
        person.email_status === 'verified'
          ? 1
          : person.email_status === 'guessed'
            ? 0.5
            : undefined,
      raw: person,
    };
  },
};
