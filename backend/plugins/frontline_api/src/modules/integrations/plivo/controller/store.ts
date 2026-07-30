import { normalizePhone } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { receiveInboxMessage } from '~/modules/inbox/receiveMessage';
import { debugError } from '@/integrations/plivo/debuggers';
import {
  IPlivoCustomerDocument,
  IPlivoIntegrationDocument,
} from '@/integrations/plivo/@types';

/**
 * Resolves a caller to a core contact, creating one if needed.
 *
 * Two records are involved: a plugin-local row keyed by the normalised number
 * for cheap callback lookups, and the core contact the inbox actually displays.
 * The number is normalised to E.164 BEFORE either is written, so a caller who
 * also messages on WhatsApp resolves to ONE contact — core matches
 * `primaryPhone` as an exact string and has no unique index to catch a
 * mismatch.
 *
 * If the core call fails the local row is removed again, so a later retry is
 * not blocked by a half-created customer that has no `erxesApiId`.
 *
 * @param rawPhone - the caller number as Plivo delivered it
 */
export const getOrCreateCustomer = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  rawPhone: string,
  displayName?: string,
): Promise<IPlivoCustomerDocument> => {
  const phoneNumber = normalizePhone(rawPhone, integration.defaultCountryCode);

  if (!phoneNumber) {
    throw new Error(`Unusable caller number: ${rawPhone}`);
  }

  const existing = await models.PlivoCustomers.findOne({ phoneNumber });

  if (existing) {
    return existing;
  }

  let customer: IPlivoCustomerDocument;

  try {
    customer = await models.PlivoCustomers.create({
      phoneNumber,
      primaryPhone: phoneNumber,
      firstName: displayName,
      integrationId: integration.erxesApiId,
    });
  } catch (e: any) {
    // A concurrent callback for the same caller won the race; use its row.
    if (e.message?.includes('duplicate')) {
      return await models.PlivoCustomers.getCustomer({ phoneNumber });
    }

    throw e;
  }

  try {
    const response = await receiveInboxMessage(subdomain, {
      action: 'get-create-update-customer',
      payload: JSON.stringify({
        integrationId: integration.erxesApiId,
        primaryPhone: phoneNumber,
        firstName: displayName,
        isUser: true,
      }),
    });

    if (response.status !== 'success') {
      throw new Error(`Customer creation failed: ${JSON.stringify(response)}`);
    }

    customer.erxesApiId = response.data._id;
    await customer.save();
  } catch (e: any) {
    await models.PlivoCustomers.deleteOne({ _id: customer._id });

    throw new Error(`Failed to sync with API: ${e.stack || e.message || e}`);
  }

  return customer;
};

/**
 * Creates the inbox conversation that surfaces a call to an agent.
 *
 * Unlike a chat thread there is one conversation per CALL, not per contact: a
 * call is a discrete event with its own duration, recording and outcome, and
 * folding several into one thread would lose the per-call detail that call
 * history is for.
 *
 * The id is stored on the local session row so the hangup and recording
 * callbacks can update the same conversation instead of raising a new one.
 */
export const createCallConversation = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  customer: IPlivoCustomerDocument,
  callUuid: string,
  content: string,
): Promise<string> => {
  const response = await receiveInboxMessage(subdomain, {
    action: 'create-or-update-conversation',
    payload: JSON.stringify({
      customerId: customer.erxesApiId,
      integrationId: integration.erxesApiId,
      content,
    }),
  });

  if (response.status !== 'success') {
    throw new Error(
      `Conversation creation failed for call ${callUuid}: ${JSON.stringify(
        response,
      )}`,
    );
  }

  return response.data._id;
};

/**
 * Writes the call itself into the conversation so the agent sees a message
 * rather than an empty thread.
 *
 * Failure here is logged and swallowed: the conversation already exists and the
 * call session row is the durable record, so losing the rendered line is worth
 * less than rejecting the callback and having Plivo retry the whole call.
 */
export const createCallMessage = async (
  subdomain: string,
  conversationId: string,
  customerId: string | undefined,
  content: string,
  createdAt: Date,
): Promise<string> => {
  try {
    const response = await receiveInboxMessage(subdomain, {
      action: 'create-conversation-message',
      metaInfo: 'replaceContent',
      payload: JSON.stringify({
        content,
        conversationId,
        customerId,
        createdAt,
      }),
    });

    if (response.status !== 'success') {
      throw new Error(JSON.stringify(response));
    }

    return response.data._id;
  } catch (e: any) {
    debugError(
      `Failed to write call message for conversation ${conversationId}: ${e.message}`,
    );

    return '';
  }
};
