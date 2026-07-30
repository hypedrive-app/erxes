import { IModels } from '~/connectionResolvers';
import { cfRecordUrl, sendToGrandStream } from './utils';
import { formatCdrApiDate } from './services/cdrUtils';
import { receiveInboxMessage } from '@/inbox/receiveMessage';
import { normalizePhone, sendTRPCMessage } from 'erxes-api-shared/utils';

/**
 * Every spelling of one caller's number that may already be stored, newest
 * first. Order matters: the caller uses `[0]` as the value to write.
 *
 * There are three, because normalisation landed in two steps and each step
 * changed the canonical form:
 *
 *  1. `canonical`  — `normalizePhone(raw, countryCode)`, what is written now.
 *  2. `legacy`     — `normalizePhone(raw)` with no country code, written by the
 *                    previous fix. A national-format number kept its trunk `0`
 *                    (`09876543210`), so it differs from `canonical`.
 *  3. `raw`        — the untouched provider spelling, written before any
 *                    normalisation. Differs from `legacy` whenever the number
 *                    carried separators (`+91 98765-43210`).
 *
 * The three collapse to fewer entries when they coincide (a number already in
 * clean E.164 yields one), which is why they are de-duplicated.
 */
const phoneSpellings = (raw: string, defaultCountryCode?: string): string[] => {
  const canonical = normalizePhone(raw, defaultCountryCode) || raw;
  const legacy = normalizePhone(raw) || raw;

  return Array.from(new Set([canonical, legacy, raw]));
};

/**
 * Resolves a caller's number to a core contact, creating one if needed.
 *
 * The number reaching core is normalised to E.164 first. Core matches
 * `primaryPhone` as an EXACT string and has no unique index on it, so a PBX
 * sending `09876543210` and WhatsApp sending `+919876543210` would otherwise
 * create two contacts for one person.
 *
 * `defaultCountryCode` comes off the call integration and is what lets a
 * national-format number reach E.164 at all — the trunk `0` cannot be resolved
 * without knowing the country. It stays optional: when the integration has none
 * configured `normalizePhone` returns the number digits-only rather than
 * assigning a guessed, possibly wrong, country.
 */
export const getOrCreateCustomer = async (
  models: IModels,
  subdomain: string,
  callAccount: any,
  defaultCountryCode?: string,
) => {
  const { inboxIntegrationId, primaryPhone: rawPrimaryPhone } = callAccount;
  if (typeof rawPrimaryPhone !== 'string') {
    throw new Error('Invalid primaryPhone: must be a string');
  }

  // Rows exist in every spelling this module has ever written. Looking up only
  // the current canonical form would miss the older ones and create a second
  // plugin-local row — which then creates a second core contact, the very bug
  // this normalisation fixes. `$in` matches any of them in one query; the
  // canonical form is what gets written for anything new.
  const knownSpellings = phoneSpellings(rawPrimaryPhone, defaultCountryCode);
  const primaryPhone = knownSpellings[0];

  let customer = await models.CallCustomers.findOne({
    primaryPhone: { $in: knownSpellings },
  });

  let createdNow = false;

  if (!customer) {
    try {
      customer = await models.CallCustomers.create({
        inboxIntegrationId,
        erxesApiId: null,
        primaryPhone,
        status: 'pending',
      });
      createdNow = true;
    } catch (e: any) {
      if (e.message?.includes('duplicate')) {
        customer = await models.CallCustomers.findOne({
          primaryPhone: { $in: knownSpellings },
        });
        if (!customer) {
          throw new Error(
            `CallCustomer duplicate for ${primaryPhone} but re-fetch found nothing`,
          );
        }
      } else {
        throw e;
      }
    }
  }

  if (customer && !customer.erxesApiId) {
    try {
      const data = {
        action: 'get-create-update-customer',
        payload: JSON.stringify({
          integrationId: inboxIntegrationId,
          primaryPhone,
          isUser: true,
          phones: [primaryPhone],
        }),
      };
      const apiCustomerResponse = await receiveInboxMessage(subdomain, data);

      if (
        apiCustomerResponse?.status === 'success' &&
        apiCustomerResponse.data?._id
      ) {
        customer.erxesApiId = apiCustomerResponse.data._id;
        customer.status = 'completed';
        await customer.save();
      } else {
        throw new Error(
          `Customer creation failed: ${JSON.stringify(apiCustomerResponse)}`,
        );
      }
    } catch (e: any) {
      if (createdNow) {
        await models.CallCustomers.deleteOne({ _id: customer._id });
      }
      throw new Error(`Failed to sync with API: ${e.stack || e.message || e}`);
    }
  }
  if (customer?.erxesApiId) {
    const coreCustomer = await sendTRPCMessage({
      subdomain,
      pluginName: 'core',
      method: 'query',
      module: 'customers',
      action: 'findOne',
      input: {
        query: { _id: customer.erxesApiId },
      },
    });
    if (coreCustomer?._id) {
      await sendTRPCMessage({
        subdomain,

        pluginName: 'core',
        method: 'mutation',
        module: 'customers',
        action: 'updateCustomer',
        input: {
          _id: coreCustomer._id,
          doc: {
            primaryPhone,
          },
        },
      });
    }
    if (!coreCustomer) {
      const newCustomer = await sendTRPCMessage({
        subdomain,

        pluginName: 'core',
        method: 'mutation', // this is a mutation, not a query
        module: 'customers',
        action: 'createCustomer',
        input: {
          doc: {
            primaryPhone,
            state: 'customer',
          },
        },
      });
      if (newCustomer?._id) {
        customer.erxesApiId = newCustomer._id;
        await customer.save();
      }
    }
  }
  return customer;
};

export async function saveRecordUrl(
  createdCdr,
  models: IModels,
  inboxId: string,
  subdomain: string,
) {
  const recordUrl =
    createdCdr.disposition === 'ANSWERED' &&
    (createdCdr.recordfiles ||
      (await fetchRecordUrl(models, inboxId, createdCdr)));

  if (recordUrl) {
    let fileDir =
      ['QUEUE', 'TRANSFER'].some((substring) =>
        createdCdr.actionType?.includes(substring),
      ) && createdCdr.userfield === 'Inbound'
        ? 'queue'
        : 'monitor';

    if (createdCdr?.action_type?.includes('FOLLOWME')) {
      if (createdCdr?.userfield === 'Inbound') {
        fileDir = 'monitor';
      }
      if (createdCdr?.userfield === 'Outbound') {
        fileDir = 'queue';
      }
    }
    const recordPath = await cfRecordUrl(
      {
        fileDir,
        recordfiles: recordUrl,
        inboxIntegrationId: inboxId,
        retryCount: 3,
      },
      '',
      models,
      subdomain,
    );

    if (recordPath?.includes('wav')) {
      await models.CallCdrs.updateOne(
        { _id: createdCdr?._id?.toString() },
        { $set: { recordUrl: recordPath } },
        { upsert: true },
      );
    }
  }
}

const fetchRecordUrl = async (models, inboxIntegrationId, params) => {
  const { src, dst, start, end } = params;
  const startTime = formatCdrApiDate(start);
  const endTime = formatCdrApiDate(end);

  const cdrData = await sendToGrandStream(
    models,
    {
      path: 'api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        request: {
          action: 'cdrapi',
          format: 'json',
          caller: src,
          callee: dst,
          numRecords: '10',
          startTime,
          endTime,
        },
      },
      integrationId: inboxIntegrationId,
      retryCount: 3,
      isConvertToJson: true,
      isGetExtension: false,
    },
    null,
  );

  const cdrRoot = cdrData.response?.cdr_root || cdrData.cdr_root;
  const recordFiles = getRecordFiles(cdrRoot);
  return recordFiles?.[0] || '';
};

function getRecordFiles(data) {
  const results = [] as any;
  data?.forEach((record: any) => {
    // Check in main_cdr
    if (
      record.main_cdr?.recordfiles &&
      record.main_cdr?.lastapp !== 'ForkCDR'
    ) {
      results.push(record.main_cdr.recordfiles);
    }

    // Check in sub_cdr_X
    Object.keys(record)?.forEach((key) => {
      if (
        key.startsWith('sub_cdr_') &&
        record[key]?.recordfiles &&
        record[key]?.lastapp !== 'ForkCDR'
      ) {
        results.push(record[key].recordfiles);
      }
    });

    // Check in b structure (no main_cdr/sub_cdr_X)
    if (record.recordfiles && record.lastapp !== 'ForkCDR') {
      results.push(record.recordfiles);
    }
  });

  return results;
}
