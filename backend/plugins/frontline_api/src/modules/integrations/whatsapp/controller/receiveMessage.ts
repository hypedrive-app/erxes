import { IModels } from '~/connectionResolvers';
import { receiveInboxMessage } from '~/modules/inbox/receiveMessage';
import {
  debugError,
  debugWhatsapp,
} from '@/integrations/whatsapp/debuggers';
import {
  getOrCreateConversation,
  getOrCreateCustomer,
} from '@/integrations/whatsapp/controller/store';
import { getWhatsappMediaUrl } from '@/integrations/whatsapp/utils';
import { MEDIA_MESSAGE_TYPES } from '@/integrations/whatsapp/constants';
import {
  IWhatsappAttachment,
  IWhatsappIntegrationDocument,
  IWhatsappWebhookBody,
  IWhatsappWebhookMessage,
  IWhatsappWebhookStatus,
  IWhatsappWebhookValue,
  WhatsappMediaMessageType,
  WhatsappMessageType,
} from '@/integrations/whatsapp/@types';

/**
 * Narrows a message to one that carries a media id, so the media field can be
 * read off it by key without a cast.
 */
const isMediaMessage = (
  type: WhatsappMessageType,
): type is WhatsappMediaMessageType =>
  (MEDIA_MESSAGE_TYPES as readonly string[]).includes(type);

/**
 * Renders a Cloud API message into the text the inbox displays, and resolves
 * any attachment.
 *
 * Media arrives as an id, not a URL, so it is exchanged for a short-lived
 * download link. That call is allowed to fail without losing the message: an
 * attachment we cannot resolve is worth less than a thread that never appears.
 */
const extractContent = async (
  message: IWhatsappWebhookMessage,
  integration: IWhatsappIntegrationDocument,
): Promise<{ content: string; attachments: IWhatsappAttachment[] }> => {
  const attachments: IWhatsappAttachment[] = [];

  if (message.type === 'text') {
    return { content: message.text?.body || '', attachments };
  }

  if (isMediaMessage(message.type)) {
    const media = message[message.type];

    if (media?.id) {
      const url = await getWhatsappMediaUrl({
        accessToken: integration.accessToken,
        mediaId: media.id,
      });

      if (url) {
        attachments.push({
          url,
          name: media.filename || `${message.type}-${media.id}`,
          type: media.mime_type || message.type,
        });
      }
    }

    return { content: media?.caption || `[${message.type}]`, attachments };
  }

  if (message.type === 'location') {
    const { latitude, longitude, name } = message.location || {};

    return {
      content: name || `[location] ${latitude}, ${longitude}`,
      attachments,
    };
  }

  // Interactive replies (buttons / list picks) carry the user's choice as the
  // title; that title is what the agent needs to see.
  if (message.type === 'interactive') {
    const { button_reply, list_reply } = message.interactive || {};

    return {
      content: button_reply?.title || list_reply?.title || '[interactive]',
      attachments,
    };
  }

  if (message.type === 'button') {
    return { content: message.button?.text || '[button]', attachments };
  }

  return { content: `[${message.type}]`, attachments };
};

/**
 * Handles one inbound customer message.
 *
 * Ordering matters: the local message row is written BEFORE the inbox is told
 * about it. That row's unique `mid` is what makes a redelivered webhook a
 * no-op, so writing it first means a retry cannot produce a second copy in the
 * agent's inbox.
 */
const receiveCustomerMessage = async (
  models: IModels,
  subdomain: string,
  integration: IWhatsappIntegrationDocument,
  message: IWhatsappWebhookMessage,
  value: IWhatsappWebhookValue,
) => {
  const waId = message.from;

  if (!waId) {
    return;
  }

  // Meta timestamps are seconds since epoch, as a string.
  const timestamp = new Date(Number(message.timestamp || 0) * 1000);

  const existingMessage = await models.WhatsappConversationMessages.findOne({
    mid: message.id,
  });

  if (existingMessage) {
    debugWhatsapp(`Ignoring already-processed message ${message.id}`);
    return;
  }

  const profileName = value.contacts?.find((c) => c.wa_id === waId)?.profile
    ?.name;

  const customer = await getOrCreateCustomer(
    models,
    subdomain,
    integration,
    waId,
    profileName,
  );

  const { content, attachments } = await extractContent(message, integration);

  const conversation = await getOrCreateConversation(
    models,
    subdomain,
    integration,
    customer,
    waId,
    content,
    timestamp,
  );

  const created = await models.WhatsappConversationMessages.addMessage({
    mid: message.id,
    conversationId: conversation._id,
    content,
    attachments,
    customerId: customer.erxesApiId,
    createdAt: timestamp,
  });

  // addMessage returns the pre-existing row when the wamid was already stored,
  // which means a concurrent delivery of the same webhook already notified the
  // inbox. Stop here rather than raising a duplicate.
  if (created.mid === message.id && created.erxesApiMessageId) {
    return;
  }

  try {
    // `create-conversation-message` both stores the message and publishes the
    // conversationMessageInserted event the open inbox subscribes to, so no
    // separate publish is needed here.
    const response = await receiveInboxMessage(subdomain, {
      action: 'create-conversation-message',
      metaInfo: 'replaceContent',
      payload: JSON.stringify({
        content,
        attachments,
        conversationId: conversation.erxesApiId,
        customerId: customer.erxesApiId,
        createdAt: timestamp,
      }),
    });

    if (response.status !== 'success') {
      throw new Error(JSON.stringify(response));
    }

    created.erxesApiMessageId = response.data._id;
    await created.save();
  } catch (e: any) {
    // Roll the local row back so a Meta retry is reprocessed rather than being
    // silently swallowed by the `mid` dedup check above.
    await models.WhatsappConversationMessages.deleteOne({ _id: created._id });

    throw new Error(
      `Failed to deliver WhatsApp message to inbox: ${e.message}`,
    );
  }
};

/**
 * Records a delivery receipt (sent / delivered / read / failed) for a message
 * we sent. Statuses for messages we never stored are ignored.
 */
const receiveStatusUpdate = async (
  models: IModels,
  status: IWhatsappWebhookStatus,
) => {
  if (!status.id || !status.status) {
    return;
  }

  const errorMessage = status.errors?.[0]?.title;

  await models.WhatsappConversationMessages.updateOne(
    { mid: status.id },
    {
      $set: {
        deliveryStatus: status.status,
        ...(errorMessage ? { errorMessage } : {}),
      },
    },
  );
};

/**
 * Entry point for a verified webhook payload.
 *
 * Each message is handled independently so one bad entry cannot discard the
 * rest of the batch; failures are logged and swallowed because Meta retries a
 * non-2xx for the WHOLE batch, which would redeliver messages already stored.
 */
export const receiveMessage = async (
  models: IModels,
  subdomain: string,
  body: IWhatsappWebhookBody,
) => {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value: IWhatsappWebhookValue = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      const integration = await models.WhatsappIntegrations.findOne({
        phoneNumberId,
        isActive: true,
      });

      if (!integration) {
        debugWhatsapp(
          `Ignoring webhook for unknown phone number id ${phoneNumberId}`,
        );
        continue;
      }

      for (const message of value.messages || []) {
        try {
          await receiveCustomerMessage(
            models,
            subdomain,
            integration,
            message,
            value,
          );
        } catch (e: any) {
          debugError(
            `Failed to process WhatsApp message ${message.id}: ${e.message}`,
          );
        }
      }

      for (const status of value.statuses || []) {
        try {
          await receiveStatusUpdate(models, status);
        } catch (e: any) {
          debugError(
            `Failed to process WhatsApp status ${status.id}: ${e.message}`,
          );
        }
      }
    }
  }
};
