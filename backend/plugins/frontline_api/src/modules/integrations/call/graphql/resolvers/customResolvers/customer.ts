import { normalizePhone, sendTRPCMessage } from 'erxes-api-shared/utils';
import { IContext } from '~/connectionResolvers';

export default {
  async customer(
    { customerPhone, inboxIntegrationId },
    _params,
    { models, subdomain }: IContext,
  ) {
    if (!customerPhone) {
      return null;
    }

    // The country code lives on the call integration, and the history row this
    // resolver hangs off already carries the integration id — so look it up by
    // that rather than widening the resolver's contract.
    const integration = inboxIntegrationId
      ? await models.CallIntegrations.findOne({
          inboxId: inboxIntegrationId,
        }).lean()
      : null;

    // `customerPhone` comes off the raw CDR/session record, but the core
    // contact is stored under its normalised form — and which normalised form
    // depends on WHEN the contact was written. Core matches phones as an exact
    // string, so query every spelling this module has ever produced:
    //   - with the country code: the canonical form written now;
    //   - without it: what the earlier normalisation wrote, which for a
    //     national-format number kept its trunk `0` and so differs;
    //   - raw: written before normalisation existed at all.
    const phones = Array.from(
      new Set(
        [
          normalizePhone(customerPhone, integration?.defaultCountryCode),
          normalizePhone(customerPhone),
          customerPhone,
        ].filter(Boolean),
      ),
    );

    // Fetch the user who sent the reply
    const customer = await sendTRPCMessage({
      subdomain,

      pluginName: 'core',
      method: 'query',
      module: 'customers',
      action: 'findOne',
      input: {
        $or: [
          { primaryPhone: { $in: phones } },
          { phones: { $in: phones } },
        ],
      },
    });

    return customer;
  },
};
