import { IContext } from '~/connectionResolvers';
import {
  ENRICHMENT_CONFIG_CODES,
  EnrichmentConfigCode,
  getEnrichmentConfigStatus,
} from '@/providers/config';
import { enrichCustomer } from '@/providers/enrichService';

export const providersMutations = {
  /**
   * Runs one provider against one customer.
   *
   * Never throws for a business outcome — a miss, a record without enough
   * input, or a missing key all come back as an `outcome` the UI can render.
   * Only a genuine fault (customer not found, unknown provider) throws.
   */
  enrichCustomer: async (
    _parent: undefined,
    {
      customerId,
      provider,
      overrides,
    }: {
      customerId: string;
      provider: string;
      overrides?: Record<string, string>;
    },
    { models, subdomain, user }: IContext,
  ) =>
    enrichCustomer({
      models,
      subdomain,
      customerId,
      providerKey: provider,
      overrides,
      userId: user?._id,
    }),

  enrichmentSetConfig: async (
    _parent: undefined,
    { code, value }: { code: string; value?: string },
    { models }: IContext,
  ) => {
    // Rejecting an unknown code keeps this from becoming a general-purpose
    // key-value store that anything could write into.
    if (!ENRICHMENT_CONFIG_CODES.includes(code as EnrichmentConfigCode)) {
      throw new Error(
        `Unknown config code "${code}". Known: ${ENRICHMENT_CONFIG_CODES.join(', ')}`,
      );
    }

    await models.EnrichmentConfigs.setConfig(code, value || '');

    const statuses = await getEnrichmentConfigStatus(models);

    return statuses.find((s) => s.code === code);
  },
};
