import { stripHtml } from 'string-strip-html';
import { IModels } from '~/connectionResolvers';
import {
  sendWhatsappText,
  WhatsappApiError,
} from '@/integrations/whatsapp/utils';
import { CUSTOMER_SERVICE_WINDOW_MS } from '@/integrations/whatsapp/constants';
import { debugError } from '@/integrations/whatsapp/debuggers';

/**
 * Handles an agent's outgoing reply, dispatched from the inbox.
 *
 * WhatsApp only accepts a free-form message within 24 hours of the customer's
 * last message; after that Meta rejects it (131047) and a pre-approved template
 * is required. The window is checked locally first so the common case fails
 * fast with a message an agent can act on, but Meta remains the authority —
 * its own rejection is translated to the same wording, since our
 * `lastCustomerMessageAt` can lag behind if a webhook was missed.
 */
export const handleWhatsappMessage = async (models: IModels, msg) => {
  const { payload } = msg;
  const doc = JSON.parse(payload || '{}');

  const conversation = await models.WhatsappConversations.getConversation({
    erxesApiId: doc.conversationId,
  });

  // An internal note is stored for the agent's own record and never sent.
  if (doc.internal) {
    return models.WhatsappConversationMessages.addMessage({
      ...doc,
      mid: `internal-${doc.conversationId}-${Date.now()}`,
      conversationId: conversation._id,
    });
  }

  const integration = await models.WhatsappIntegrations.getIntegration({
    erxesApiId: conversation.integrationId,
  });

  const content = stripHtml(doc.content || '').result.trim();

  if (!content) {
    throw new Error('Cannot send an empty WhatsApp message');
  }

  const lastCustomerMessageAt = conversation.lastCustomerMessageAt;

  if (
    lastCustomerMessageAt &&
    Date.now() - new Date(lastCustomerMessageAt).getTime() >
      CUSTOMER_SERVICE_WINDOW_MS
  ) {
    throw new Error(
      'This conversation is outside the 24 hour WhatsApp reply window. ' +
        'Only a pre-approved template message can be sent.',
    );
  }

  let mid: string;

  try {
    mid = await sendWhatsappText({
      accessToken: integration.accessToken,
      phoneNumberId: integration.phoneNumberId,
      // Meta expects the recipient without a leading `+`.
      to: conversation.senderId,
      text: content,
    });
  } catch (e) {
    if (e instanceof WhatsappApiError && e.isOutsideServiceWindow) {
      throw new Error(
        'This conversation is outside the 24 hour WhatsApp reply window. ' +
          'Only a pre-approved template message can be sent.',
      );
    }

    debugError(`Failed to send WhatsApp message: ${e.message}`);
    throw e;
  }

  return models.WhatsappConversationMessages.addMessage({
    ...doc,
    mid,
    conversationId: conversation._id,
    content,
    createdAt: new Date(),
  });
};
