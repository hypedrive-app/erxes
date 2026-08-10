import { Document } from 'mongoose';

/**
 * One shape for every enrichment provider.
 *
 * Surfe, Apollo and Hunter each answer a different question and each want a
 * different input, so the interface is deliberately built around what a
 * provider CAN do rather than assuming they are interchangeable:
 *
 *   Hunter  — needs a domain. Finds/verifies email addresses on that domain.
 *   Apollo  — needs a name plus a company (or a domain). Returns a person's
 *             work email, title and company facts from its B2B database.
 *   Surfe   — needs a LinkedIn URL, or a name plus company. Returns contact
 *             details and role.
 *
 * `canHandle` exists because of that: with 408 of our own customers carrying a
 * name and nothing else, most lookups have no usable input at all. Asking each
 * provider up front is what lets the UI say "not enough information" instead of
 * spending an API credit to be told the same thing.
 */

export type TEnrichmentInput = {
  // Everything is optional: the caller passes whatever the customer record
  // happens to hold, and each provider decides whether that is enough.
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  domain?: string;
  linkedinUrl?: string;
  // Indian statutory identifiers, used only by Surepass. They live on the
  // shared input rather than a provider-specific type so the resolver can build
  // one input object and let each provider's canHandle decide.
  gstin?: string;
  din?: string;
};

/**
 * What a provider found. Every field optional — a partial hit is still useful,
 * and the write-back only touches keys that actually came back.
 */
export type TEnrichmentResult = {
  email?: string;
  phone?: string;
  jobTitle?: string;
  seniority?: string;
  linkedinUrl?: string;
  companyName?: string;
  companyDomain?: string;
  companySize?: string;
  companyIndustry?: string;
  location?: string;
  // 0..1 where the provider reports one. Hunter returns a confidence score on
  // email guesses; a low score is worth surfacing rather than silently writing.
  confidence?: number;
  // Untouched provider payload, for debugging a bad result without re-querying.
  raw?: Record<string, unknown>;
};

export type TEnrichmentProvider = {
  // Stable identifier used in config codes, the GraphQL enum and stored audit
  // rows. Never rename one of these without a migration.
  key: 'surfe' | 'apollo' | 'hunter' | 'surepass';
  label: string;

  /**
   * Whether this provider has enough to work with. Pure and side-effect free —
   * it must not call the network, because the UI runs it to decide which
   * buttons to enable.
   */
  canHandle: (input: TEnrichmentInput) => boolean;

  /**
   * Performs the lookup. Returns null when the provider ran but found nothing,
   * which is different from throwing — a miss is a normal outcome and must not
   * look like an outage.
   */
  enrich: (
    input: TEnrichmentInput,
    apiKey: string,
  ) => Promise<TEnrichmentResult | null>;
};

// ── Mongoose document types ─────────────────────────────────────────────────

export type IEnrichmentConfig = {
  code: string;
  value: string;
};

export type IEnrichmentConfigDocument = IEnrichmentConfig & Document;

export type IEnrichmentLog = {
  contentType: string;
  contentId: string;
  provider: string;
  outcome: 'hit' | 'miss' | 'skipped' | 'error';
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
  userId?: string;
  createdAt?: Date;
};

export type IEnrichmentLogDocument = IEnrichmentLog & Document;
