import { sendTRPCMessage } from 'erxes-api-shared/utils';

import { IContext } from '~/connectionResolvers';
import {
  getEnrichmentConfig,
  getEnrichmentConfigStatus,
  PROVIDER_CONFIG_CODE,
} from '@/providers/config';
import { ensureEnrichmentFields } from '@/providers/fields';
import { PROVIDERS } from '@/providers/providers';

export const providersQueries = {
  /**
   * Providers with their state for one record.
   *
   * Both halves matter to the UI: `isConfigured` is about the deployment (is
   * there an API key), `canHandle` is about this record (is there enough to
   * look up). A provider can be configured and still unusable here, which is
   * the common case for records carrying only a name.
   */
  enrichmentProviders: async (
    _parent: undefined,
    { customerId }: { customerId?: string },
    { models, subdomain }: IContext,
  ) => {
    let input: Record<string, any> = {};

    if (customerId) {
      const customer = (await sendTRPCMessage({
        subdomain,
        pluginName: 'core',
        module: 'customers',
        action: 'findOne',
        method: 'query',
        input: { _id: customerId },
        defaultValue: null,
      })) as Record<string, any> | null;

      if (customer) {
        const fieldIds = await ensureEnrichmentFields(
          subdomain,
          'core:customer',
        );
        const props = customer.propertiesData || {};
        const prop = (code: string) =>
          fieldIds[code] ? props[fieldIds[code]] : undefined;

        input = {
          firstName: customer.firstName,
          lastName: customer.lastName,
          fullName: [customer.firstName, customer.lastName]
            .filter(Boolean)
            .join(' ')
            .trim(),
          email: customer.primaryEmail,
          phone: customer.primaryPhone,
          companyName: prop('enrichment_company_name'),
          domain: prop('enrichment_company_domain'),
          linkedinUrl: prop('enrichment_linkedin'),
        };
      }
    }

    return Promise.all(
      Object.values(PROVIDERS).map(async (provider) => {
        const apiKey = await getEnrichmentConfig(
          models,
          PROVIDER_CONFIG_CODE[provider.key],
        );

        const canHandle = customerId ? provider.canHandle(input) : false;

        return {
          key: provider.key,
          label: provider.label,
          isConfigured: Boolean(apiKey),
          canHandle,
          reason: !apiKey
            ? 'No API key configured'
            : customerId && !canHandle
              ? 'This record lacks the inputs this provider needs'
              : null,
        };
      }),
    );
  },

  enrichmentConfigStatus: async (
    _parent: undefined,
    _args: undefined,
    { models }: IContext,
  ) => getEnrichmentConfigStatus(models),

  enrichmentLogs: async (
    _parent: undefined,
    { contentType, contentId }: { contentType: string; contentId: string },
    { models }: IContext,
  ) => models.EnrichmentLogs.lastFor(contentType, contentId),
};
