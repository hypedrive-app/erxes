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
import { rehostInboundMedia } from '@/integrations/whatsapp/media';
import { MEDIA_MESSAGE_TYPES } from '@/integrations/whatsapp/constants';
import {
  IWhatsappAttachment,
  IWhatsappConversationMessageDocument,
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
  subdomain: string,
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
        /**
         * Meta's URL is NOT stored. It expires after 5 minutes and requires a
         * bearer token even before then, so an <img src> could never render
         * it — inbound media was effectively never viewable. The bytes are
         * copied into our own storage and the permanent key is stored instead.
         *
         * Meta keeps webhook media for 7 days, so this has to happen on
         * receipt rather than lazily on first view.
         *
         * rehostInboundMedia falls back to the original attachment if the copy
         * fails, which keeps a message with an unreachable file rather than
         * losing the message itself.
         */
        attachments.push(
          await rehostInboundMedia({
            subdomain,
            accessToken: integration.accessToken,
            mediaId: media.id,
            attachment: {
              url,
              name: media.filename || `${message.type}-${media.id}`,
              type: media.mime_type || message.type,
            },
          }),
        );
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

  // A reaction carries no body of its own; `emoji` is omitted entirely when the
  // user REMOVES their reaction, which is why the two cases read differently.
  if (message.type === 'reaction') {
    const emoji = message.reaction?.emoji;

    return {
      content: emoji ? `[reacted ${emoji}]` : '[removed reaction]',
      attachments,
    };
  }

  // Meta delivers types it cannot render (e.g. 131051) with the reason in
  // `errors[]`, so show that rather than a bare type name.
  const error = message.errors?.[0];

  if (error) {
    const detail = error.error_data?.details || error.title || error.message;

    return {
      content: detail ? `[unsupported message: ${detail}]` : '[unsupported message]',
      attachments,
    };
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

  // `id` is the wamid the whole dedup scheme keys on; without it a redelivery
  // could not be recognised, so the message is not storable.
  if (!waId || !message.id) {
    return;
  }

  // Meta timestamps are seconds since epoch, as a string. A missing or
  // unparseable one must not become 1970 — that would leave the conversation
  // permanently outside the 24h reply window.
  const timestampSeconds = Number(message.timestamp);

  const timestamp =
    Number.isFinite(timestampSeconds) && timestampSeconds > 0
      ? new Date(timestampSeconds * 1000)
      : new Date();

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

  const { content, attachments } = await extractContent(
    subdomain,
    message,
    integration,
  );

  const conversation = await getOrCreateConversation(
    models,
    subdomain,
    integration,
    customer,
    waId,
    content,
    timestamp,
  );

  // Inserted directly rather than through `addMessage` so a duplicate `mid` is
  // distinguishable from a fresh insert: only the request that actually created
  // the row may notify the inbox or roll the row back. `addMessage` returns the
  // pre-existing row instead, which would let a concurrent redelivery both
  // deliver a second copy to the inbox and delete the other request's row.
  let created: IWhatsappConversationMessageDocument;

  try {
    created = await models.WhatsappConversationMessages.create({
      mid: message.id,
      conversationId: conversation._id,
      content,
      attachments,
      customerId: customer.erxesApiId,
      createdAt: timestamp,
    });
  } catch (e: any) {
    if (e.code === 11000 || e.message?.includes('duplicate')) {
      debugWhatsapp(
        `Concurrent delivery of message ${message.id} already stored`,
      );
      return;
    }

    throw e;
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
 * Records a delivery receipt for a message we sent. Statuses for messages we
 * never stored are ignored.
 *
 * Meta documents five values — sent, delivered, read, played and failed —
 * where `played` is the first play of a voice note. They are stored verbatim
 * rather than mapped, so a value added later is still recorded.
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status
 */
const receiveStatusUpdate = async (
  models: IModels,
  status: IWhatsappWebhookStatus,
) => {
  if (!status.id || !status.status) {
    return;
  }

  // `error_data.details` is the specific, human-readable reason; `title` is
  // only the generic name of the code, so it is the fallback rather than the
  // first choice.
  const error = status.errors?.[0];

  const errorMessage = error
    ? error.error_data?.details || error.message || error.title
    : undefined;

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
