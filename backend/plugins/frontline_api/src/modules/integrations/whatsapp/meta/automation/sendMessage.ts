import { replaceOutputPlaceholders } from 'erxes-api-shared/core-modules';
import { IModels } from '~/connectionResolvers';
import { handleWhatsappMessage } from '@/integrations/whatsapp/handleWhatsappMessage';
import { debugError } from '@/integrations/whatsapp/debuggers';

type TSendWhatsappMessageParams = {
  models: IModels;
  subdomain: string;
  action: any;
  execution: any;
};

/**
 * Sends a WhatsApp reply from an automation.
 *
 * Delegates to `handleWhatsappMessage` rather than calling `sendWhatsappText`
 * directly. That function is the single path every agent reply already takes
 * (inbox UI -> conversationMessageAdd -> handleWhatsappIntegration), and it
 * owns behaviour this action must not reimplement: it resolves the integration
 * and conversation, maps Meta's 131047 to the "outside the 24-hour service
 * window" error, flips the integration's healthStatus on an auth failure, and
 * persists the sent message so the reply appears in the agent's thread rather
 * than only on the customer's phone.
 *
 * Reimplementing any of that here would mean an automation-sent message
 * silently diverging from an agent-sent one.
 */
export const actionSendWhatsappMessage = async ({
  models,
  subdomain,
  action,
  execution,
}: TSendWhatsappMessageParams) => {
  const resolved = (await replaceOutputPlaceholders({
    subdomain,
    execution,
    values: (action.config || {}) as Record<string, unknown>,
    defaultValue: '',
  })) as Record<string, unknown>;

  let text = typeof resolved.text === 'string' ? resolved.text.trim() : '';

  // Falling back to the last AI result mirrors the inbox action
  // (inbox/meta/automation/workers.ts), so an "AI Agent -> Send WhatsApp
  // Message" pair works with the send step left unconfigured — which is how
  // the builder is used in practice.
  if (!text) {
    const lastAiText = [...(execution.actions || [])]
      .reverse()
      .find(
        (a: any) =>
          a.status === 'success' && typeof a.result?.text === 'string',
      )?.result?.text;

    if (typeof lastAiText === 'string') {
      text = lastAiText.trim();
    }
  }

  if (!text) {
    throw new Error(
      'WhatsApp message action requires text, or a preceding AI action that produced some',
    );
  }

  // The trigger target carries the conversation this execution belongs to.
  // Without it there is nothing to reply to — an automation enrolled from a
  // non-WhatsApp trigger would land here with no conversationId.
  const conversationId =
    execution?.target?.conversationId ||
    (typeof resolved.conversationId === 'string'
      ? resolved.conversationId
      : '');

  if (!conversationId) {
    throw new Error(
      'WhatsApp message action needs a conversationId; enrol it from a WhatsApp trigger',
    );
  }

  try {
    const sent = await handleWhatsappMessage(models, subdomain, {
      payload: JSON.stringify({
        conversationId,
        content: text,
        // No userId: this reply has no human author. handleWhatsappMessage
        // stores it as-is, which is what marks it a bot reply in the thread.
        attachments: [],
      }),
    });

    return {
      result: {
        messageId: sent?._id,
        mid: sent?.mid,
        content: text,
        conversationId,
      },
    };
  } catch (e) {
    // Surface the reason on the execution rather than swallowing it. The
    // 24-hour-window and dead-token cases both arrive here as plain Errors
    // with a human-readable message from handleWhatsappMessage.
    debugError(`WhatsApp automation send failed: ${(e as Error).message}`);
    throw e;
  }
};
