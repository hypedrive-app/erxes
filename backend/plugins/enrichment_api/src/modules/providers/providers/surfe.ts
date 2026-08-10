import {
  TEnrichmentInput,
  TEnrichmentProvider,
  TEnrichmentResult,
} from '@/providers/@types/providers';

// The two calls sit on DIFFERENT API versions. This is Surfe's own layout, not
// a typo: the bulk enrich endpoint is v2, the poll endpoint is v1.
const START_URL = 'https://api.surfe.com/v2/people/enrich';
const POLL_URL = 'https://api.surfe.com/v1/people/enrichments';

// A button-driven lookup has a person waiting on it, so this cannot poll
// indefinitely. ~20s total: long enough for a normal single-person job, short
// enough that the UI is not left hanging. A job that outlives this is reported
// as a miss with a message, not as an error.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 10;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Surfe — contact enrichment.
 *
 * Unlike Hunter and Apollo this API is ASYNCHRONOUS: POST starts a job and
 * returns 202 with an id, and the result is fetched from a second endpoint.
 * Everything else in this plugin is request/response, so the polling is
 * confined here rather than leaking into the shared provider interface.
 *
 * Note there is also a deprecated single-person start endpoint. The v2 bulk
 * endpoint is used even for one person, which is what Surfe now documents.
 */
export const surfeProvider: TEnrichmentProvider = {
  key: 'surfe',
  label: 'Surfe',

  canHandle: (input: TEnrichmentInput) => {
    if (input.linkedinUrl) {
      return true;
    }

    const hasName = Boolean(input.firstName && input.lastName);

    return hasName && Boolean(input.companyName || input.domain);
  },

  enrich: async (
    input: TEnrichmentInput,
    apiKey: string,
  ): Promise<TEnrichmentResult | null> => {
    const person: Record<string, string> = {};

    if (input.linkedinUrl) person.linkedinUrl = input.linkedinUrl;
    if (input.firstName) person.firstName = input.firstName;
    if (input.lastName) person.lastName = input.lastName;
    if (input.companyName) person.companyName = input.companyName;
    if (input.domain) person.companyDomain = input.domain;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const startResponse = await fetch(START_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        people: [person],
        // At least one must be requested or Surfe rejects the job.
        include: { email: true, mobile: true, linkedInUrl: true },
      }),
    });

    const startBody = await startResponse.json().catch(() => ({}));

    if (!startResponse.ok) {
      throw new Error(
        `Surfe: ${startBody?.message || startResponse.status}`,
      );
    }

    const enrichmentId = startBody?.enrichmentID;

    if (!enrichmentId) {
      throw new Error('Surfe: no enrichment id returned');
    }

    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const pollResponse = await fetch(`${POLL_URL}/${enrichmentId}`, {
        method: 'GET',
        headers,
      });

      const pollBody = await pollResponse.json().catch(() => ({}));

      if (!pollResponse.ok) {
        throw new Error(`Surfe: ${pollBody?.message || pollResponse.status}`);
      }

      const status = String(pollBody?.status || '').toUpperCase();

      if (status === 'IN_PROGRESS' || status === 'PENDING') {
        continue;
      }

      if (status === 'FAILED') {
        throw new Error(
          `Surfe: ${pollBody?.errors?.[0]?.message || 'enrichment failed'}`,
        );
      }

      // Surfe returns the people array on the completed job. An empty array,
      // or a person with no contact details, is a miss.
      const found = pollBody?.people?.[0] || pollBody;
      const email = found?.emails?.[0]?.email;
      const mobile = found?.mobilePhones?.[0]?.mobilePhone;

      if (!email && !mobile && !found?.jobTitle) {
        return null;
      }

      return {
        email: email || undefined,
        phone: mobile || undefined,
        jobTitle: found?.jobTitle || undefined,
        seniority: found?.seniorities?.[0] || undefined,
        linkedinUrl: found?.linkedinUrl || undefined,
        companyName: found?.companyName || undefined,
        companyDomain: found?.companyWebsite || undefined,
        location:
          [found?.city, found?.state, found?.country]
            .filter(Boolean)
            .join(', ') || undefined,
        confidence: found?.mobilePhones?.[0]?.confidenceScore,
        raw: found,
      };
    }

    // Timed out rather than failed. Reported as a miss so the operator is not
    // shown an error for something that may still complete on Surfe's side.
    return null;
  },
};
