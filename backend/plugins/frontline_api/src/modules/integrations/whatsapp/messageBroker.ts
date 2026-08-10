import { IModels, generateModels } from '~/connectionResolvers';
import { handleWhatsappMessage } from '@/integrations/whatsapp/handleWhatsappMessage';
import { markWhatsappMessageRead } from '@/integrations/whatsapp/utils';
import {
  whatsappCreateIntegration,
  whatsappRemoveIntegration,
  whatsappRepairIntegration,
  whatsappUpdateIntegration,
} from '@/integrations/whatsapp/helpers';

/**
 * Entry point used by the inbox to dispatch an outgoing message.
 *
 * Mirrors `handleFacebookIntegration`: these are plain in-process functions
 * called directly from the inbox mutations, not queue consumers.
 *
 * Branches on `action`, not just `type`. The inbox dispatches BOTH replies and
 * typing notifications here with `type: 'whatsapp'` — before this branch
 * existed, every keystroke's typing dispatch fell into the message path and
 * threw "Cannot send an empty WhatsApp message", which the caller's own bare
 * catch then swallowed. Nothing was visibly broken, and the typing indicator
 * simply never worked.
 */
export const handleWhatsappIntegration = async ({ subdomain, data }) => {
  const models = await generateModels(subdomain);
  const { type, action } = data;

  let response: {
    status: 'success' | 'error';
    data?: any;
    errorMessage?: string;
  } = {
    status: 'success',
  };

  try {
    if (type !== 'whatsapp') {
      return response;
    }

    if (action === 'typing') {
      await handleWhatsappTyping(models, data);
    } else {
      response.data = await handleWhatsappMessage(models, subdomain, data);
    }
  } catch (e) {
    response = {
      status: 'error',
      errorMessage: e.message,
    };
  }

  return response;
};

/**
 * Shows the typing indicator to the contact while an agent composes.
 *
 * Meta only accepts the indicator attached to a read receipt for a specific
 * inbound message, so this marks the contact's most recent message read and
 * rides the indicator along with it. That is also why there is nothing to do
 * for `typing: false` — the indicator cannot be withdrawn, it expires on its
 * own after 25 seconds or the moment our reply lands.
 *
 * Best-effort throughout: a typing indicator is cosmetic, and a conversation
 * whose last inbound message we no longer hold simply gets none.
 */
const handleWhatsappTyping = async (models: IModels, data) => {
  const { typing, conversationId } = JSON.parse(data.payload || '{}');

  if (!typing || !conversationId) {
    return;
  }

  const conversation = await models.WhatsappConversations.findOne({
    erxesApiId: conversationId,
  });

  if (!conversation) {
    return;
  }

  // The indicator hangs off an inbound message, so an outbound one cannot
  // carry it — `customerId` is what distinguishes the two.
  const lastInbound = await models.WhatsappConversationMessages.findOne(
    { conversationId: conversation._id, customerId: { $exists: true } },
    { mid: 1 },
  ).sort({ createdAt: -1 });

  if (!lastInbound?.mid) {
    return;
  }

  const integration = await models.WhatsappIntegrations.getIntegration({
    erxesApiId: conversation.integrationId,
  });

  await markWhatsappMessageRead({
    accessToken: integration.accessToken,
    phoneNumberId: integration.phoneNumberId,
    messageId: lastInbound.mid,
    showTyping: true,
  });
};

export const whatsappCreateIntegrations = async ({ subdomain, data }) => {
  try {
    return await whatsappCreateIntegration(subdomain, data);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to create integration: ${e.message}`,
    };
  }
};

/**
 * `doc` is the envelope `sendUpdateIntegration` builds, not the config itself —
 * the JSON string the update expects is `doc.data`. Passing `doc` straight
 * through reached `parseConfig` as an object and failed every update with
 * `Invalid payload format: "[object Object]" is not valid JSON`, which is how a
 * WhatsApp integration became uneditable once created.
 */
export const whatsappUpdateIntegrations = async ({
  subdomain,
  data: { integrationId, doc },
}): Promise<{ status: string; errorMessage?: string }> => {
  try {
    return await whatsappUpdateIntegration(subdomain, integrationId, doc?.data);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to update integration: ${e.message}`,
    };
  }
};

export const whatsappRemoveIntegrations = async ({
  subdomain,
  data: { integrationId },
}) => {
  try {
    return await whatsappRemoveIntegration(subdomain, integrationId);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to remove integration: ${e.message}`,
    };
  }
};

/**
 * Re-checks stored credentials and clears the error state if they work again.
 *
 * An access token expiring is the usual way a WhatsApp integration breaks, so
 * "repair" here means revalidating rather than re-subscribing to anything.
 */
export const whatsappRepairIntegrations = async ({
  subdomain,
  data: { integrationId },
}) => {
  try {
    return await whatsappRepairIntegration(subdomain, integrationId);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to repair integration: ${e.message}`,
    };
  }
};

/**
 * Health for the integration settings screen. A missing integration is
 * reported rather than thrown so the UI can show it as disconnected.
 */
export const whatsappStatus = async ({
  subdomain,
  data: { integrationId },
}: {
  subdomain: string;
  data: { integrationId: string };
}): Promise<{ data: any; status: string }> => {
  const models = await generateModels(subdomain);

  const integration = await models.WhatsappIntegrations.findOne({
    erxesApiId: integrationId,
  });

  if (!integration) {
    return { status: 'success', data: { status: 'not-found' } };
  }

  return {
    status: 'success',
    data: {
      status: integration.healthStatus || 'healthy',
      error: integration.error,
    },
  };
};
