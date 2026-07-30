import { normalizePhone } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { receiveInboxMessage } from '~/modules/inbox/receiveMessage';
import { debugError } from '@/integrations/whatsapp/debuggers';
import {
  IWhatsappCustomerDocument,
  IWhatsappIntegrationDocument,
} from '@/integrations/whatsapp/@types';

/**
 * Resolves the WhatsApp sender to a core contact, creating one if needed.
 *
 * Two records are involved: a plugin-local row keyed by `wa_id` for cheap
 * webhook lookups, and the core contact that the inbox actually displays. The
 * phone number is normalised to E.164 before it reaches core so that the same
 * person arriving by WhatsApp and by phone call resolves to ONE contact —
 * core matches `primaryPhone` as an exact string and has no unique index to
 * catch a mismatch.
 *
 * If the core call fails the local row is removed again, so a later retry is
 * not blocked by a half-created customer that has no `erxesApiId`.
 */
export const getOrCreateCustomer = async (
  models: IModels,
  subdomain: string,
  integration: IWhatsappIntegrationDocument,
  waId: string,
  displayName?: string,
): Promise<IWhatsappCustomerDocument> => {
  const existing = await models.WhatsappCustomers.findOne({ waId });

  if (existing) {
    return existing;
  }

  // Meta sends wa_id as E.164 digits with no leading `+`.
  const primaryPhone = normalizePhone(waId, integration.defaultCountryCode);

  let customer: IWhatsappCustomerDocument;

  try {
    customer = await models.WhatsappCustomers.create({
      waId,
      primaryPhone,
      firstName: displayName,
      integrationId: integration.erxesApiId,
    });
  } catch (e: any) {
    // A concurrent webhook for the same sender won the race; use its row.
    if (e.message?.includes('duplicate')) {
      return await models.WhatsappCustomers.getCustomer({ waId });
    }

    throw e;
  }

  try {
    const response = await receiveInboxMessage(subdomain, {
      action: 'get-create-update-customer',
      payload: JSON.stringify({
        integrationId: integration.erxesApiId,
        primaryPhone,
        firstName: displayName,
        isUser: true,
      }),
    });

    if (response.status !== 'success') {
      throw new Error(
        `Customer creation failed: ${JSON.stringify(response)}`,
      );
    }

    customer.erxesApiId = response.data._id;
    await customer.save();
  } catch (e: any) {
    await models.WhatsappCustomers.deleteOne({ _id: customer._id });

    throw new Error(`Failed to sync with API: ${e.stack || e.message || e}`);
  }

  return customer;
};

/**
 * Resolves the thread for a sender, creating it on first contact.
 *
 * `lastCustomerMessageAt` is refreshed on every inbound message because it is
 * what re-opens the Cloud API's 24 hour reply window.
 */
export const getOrCreateConversation = async (
  models: IModels,
  subdomain: string,
  integration: IWhatsappIntegrationDocument,
  customer: IWhatsappCustomerDocument,
  waId: string,
  content: string,
  timestamp: Date,
) => {
  const selector = {
    senderId: waId,
    recipientId: integration.phoneNumberId,
  };

  const existing = await models.WhatsappConversations.findOne(selector);

  if (existing) {
    existing.lastCustomerMessageAt = timestamp;
    await existing.save();

    return existing;
  }

  let conversation;

  try {
    conversation = await models.WhatsappConversations.create({
      ...selector,
      integrationId: integration.erxesApiId,
      content,
      timestamp,
      lastCustomerMessageAt: timestamp,
    });
  } catch (e: any) {
    // The unique (senderId, recipientId) index rejected a concurrent insert.
    if (e.message?.includes('duplicate')) {
      return await models.WhatsappConversations.getConversation(selector);
    }

    throw e;
  }

  try {
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
        `Conversation creation failed: ${JSON.stringify(response)}`,
      );
    }

    conversation.erxesApiId = response.data._id;
    await conversation.save();
  } catch (e: any) {
    await models.WhatsappConversations.deleteOne({ _id: conversation._id });

    debugError(`Failed to sync conversation with API: ${e.message}`);

    throw e;
  }

  return conversation;
};
