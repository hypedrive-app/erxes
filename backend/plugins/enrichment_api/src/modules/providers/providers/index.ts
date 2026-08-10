import { TEnrichmentProvider } from '@/providers/@types/providers';
import { apolloProvider } from '@/providers/providers/apollo';
import { hunterProvider } from '@/providers/providers/hunter';
import { surepassProvider } from '@/providers/providers/surepass';
import { surfeProvider } from '@/providers/providers/surfe';

/**
 * Every provider, keyed by its stable identifier.
 *
 * Adding one is a single entry here plus its module — nothing else in the
 * plugin enumerates providers, so a new provider cannot be half-registered.
 */
export const PROVIDERS: Record<string, TEnrichmentProvider> = {
  surfe: surfeProvider,
  apollo: apolloProvider,
  hunter: hunterProvider,
  surepass: surepassProvider,
};

export const PROVIDER_KEYS = Object.keys(PROVIDERS);

export const getProvider = (key: string): TEnrichmentProvider => {
  const provider = PROVIDERS[key];

  if (!provider) {
    throw new Error(
      `Unknown enrichment provider "${key}". Known: ${PROVIDER_KEYS.join(', ')}`,
    );
  }

  return provider;
};
