import { stripHtml } from 'string-strip-html';
import { IModels } from '~/connectionResolvers';
import {
  sendWhatsappTemplate,
  sendWhatsappText,
  WhatsappApiError,
} from '@/integrations/whatsapp/utils';
import { CUSTOMER_SERVICE_WINDOW_MS } from '@/integrations/whatsapp/constants';
import { debugError } from '@/integrations/whatsapp/debuggers';
import {
  IWhatsappTemplateDispatch,
  IWhatsappTemplateSendComponent,
} from '@/integrations/whatsapp/@types';

const OUTSIDE_WINDOW_MESSAGE =
  'This conversation is outside the 24 hour WhatsApp reply window. ' +
  'Only a pre-approved template message can be sent.';

/**
 * Reads the template the inbox dispatched, if any.
 *
 * The inbox forwards `extraInfo` verbatim from `conversationMessageAdd`, so a
 * template ride-alongs on `extraInfo.whatsappTemplate` rather than needing a
 * parallel send mutation. Anything malformed is treated as "no template" so a
 * bad payload falls back to the free-form path (and its 24 hour guard) instead
 * of being sent as an unvalidated template.
 */
const getTemplateDispatch = (
  extraInfo: unknown,
): IWhatsappTemplateDispatch | undefined => {
  if (!extraInfo || typeof extraInfo !== 'object') {
    return undefined;
  }

  const { whatsappTemplate } = extraInfo as {
    whatsappTemplate?: Partial<IWhatsappTemplateDispatch>;
  };

  if (
    !whatsappTemplate ||
    typeof whatsappTemplate.name !== 'string' ||
    typeof whatsappTemplate.languageCode !== 'string' ||
    !whatsappTemplate.name ||
    !whatsappTemplate.languageCode
  ) {
    return undefined;
  }

  return {
    name: whatsappTemplate.name,
    languageCode: whatsappTemplate.languageCode,
    components: Array.isArray(whatsappTemplate.components)
      ? (whatsappTemplate.components as IWhatsappTemplateSendComponent[])
      : undefined,
  };
};

/**
 * Handles an agent's outgoing reply, dispatched from the inbox.
 *
 * Two send paths:
 *
 * - **Template** — when `extraInfo.whatsappTemplate` carries
 *   `{ name, languageCode, components? }`. This is the ONLY thing Meta accepts
 *   more than 24 hours after the customer's last message, so it deliberately
 *   skips the window guard; blocking it would defeat its entire purpose.
 * - **Free-form text** — everything else, still gated on the 24 hour window.
 *
 * For free-form, WhatsApp only accepts a message within 24 hours of the
 * customer's last message; after that Meta rejects it (131047). The window is
 * checked locally first so the common case fails fast with a message an agent
 * can act on, but Meta remains the authority — its own rejection is translated
 * to the same wording, since our `lastCustomerMessageAt` can lag behind if a
 * webhook was missed.
 *
 * Internal notes never reach here: `conversationMessageAdd` stores them and
 * returns before it dispatches to any integration.
 */
export const handleWhatsappMessage = async (models: IModels, msg) => {
  const { payload } = msg;
  const doc = JSON.parse(payload || '{}');

  const conversation = await models.WhatsappConversations.getConversation({
    erxesApiId: doc.conversationId,
  });

  const integration = await models.WhatsappIntegrations.getIntegration({
    erxesApiId: conversation.integrationId,
  });

  const template = getTemplateDispatch(doc.extraInfo);

  // The resolved template text is passed as `content` by the composer so the
  // thread shows what the customer actually received rather than a blank
  // bubble; a template with no body parameters still renders its approved copy.
  const content = stripHtml(doc.content || '').result.trim();

  if (!template && !content) {
    throw new Error('Cannot send an empty WhatsApp message');
  }

  const lastCustomerMessageAt = conversation.lastCustomerMessageAt;

  if (
    !template &&
    lastCustomerMessageAt &&
    Date.now() - new Date(lastCustomerMessageAt).getTime() >
      CUSTOMER_SERVICE_WINDOW_MS
  ) {
    throw new Error(OUTSIDE_WINDOW_MESSAGE);
  }

  let mid: string;

  try {
    mid = template
      ? await sendWhatsappTemplate({
          accessToken: integration.accessToken,
          phoneNumberId: integration.phoneNumberId,
          // Meta expects the recipient without a leading `+`.
          to: conversation.senderId,
          name: template.name,
          languageCode: template.languageCode,
          components: template.components,
        })
      : await sendWhatsappText({
          accessToken: integration.accessToken,
          phoneNumberId: integration.phoneNumberId,
          to: conversation.senderId,
          text: content,
        });
  } catch (e) {
    if (e instanceof WhatsappApiError && e.isOutsideServiceWindow) {
      throw new Error(OUTSIDE_WINDOW_MESSAGE);
    }

    debugError(`Failed to send WhatsApp message: ${e.message}`);
    throw e;
  }

  return models.WhatsappConversationMessages.addMessage({
    mid,
    conversationId: conversation._id,
    content,
    attachments: doc.attachments,
    userId: doc.userId,
    createdAt: new Date(),
  });
};
