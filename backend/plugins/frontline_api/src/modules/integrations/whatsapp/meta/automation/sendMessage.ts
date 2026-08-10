import { replaceOutputPlaceholders } from 'erxes-api-shared/core-modules';
import { IModels } from '~/connectionResolvers';
import { handleWhatsappMessage } from '@/integrations/whatsapp/handleWhatsappMessage';
import { debugError } from '@/integrations/whatsapp/debuggers';
import { IWhatsappTemplateDispatch } from '@/integrations/whatsapp/@types';

type TSendWhatsappMessageParams = {
  models: IModels;
  subdomain: string;
  action: any;
  execution: any;
};

/**
 * Reads a template out of the action config, or returns undefined.
 *
 * Validated to the same shape `getTemplateDispatch` requires
 * (handleWhatsappMessage.ts): a template missing either `name` or
 * `languageCode` is silently ignored there, which would turn a
 * template-only send into "Cannot send an empty WhatsApp message" with no clue
 * why. Rejecting it here names the actual problem.
 *
 * This matters more for WhatsApp than for any other channel: a template is the
 * ONLY thing Meta accepts outside the 24-hour customer service window, so it is
 * the mechanism for re-opening a conversation, not a nicety.
 */
const readTemplate = (
  value: unknown,
): IWhatsappTemplateDispatch | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const { name, languageCode, components } =
    value as Partial<IWhatsappTemplateDispatch>;

  if (!name && !languageCode && !components) {
    return undefined;
  }

  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('WhatsApp template requires a name');
  }

  if (typeof languageCode !== 'string' || !languageCode.trim()) {
    throw new Error(
      `WhatsApp template "${name}" requires a languageCode (e.g. en_US)`,
    );
  }

  return {
    name: name.trim(),
    languageCode: languageCode.trim(),
    ...(Array.isArray(components) ? { components } : {}),
  };
};

/**
 * Sends a WhatsApp reply from an automation.
 *
 * Config keys, all optional except that one of the first three must produce
 * something to send:
 *   text                 string   body; falls back to the last AI action's text
 *   template             { name, languageCode, components? }  approved template
 *   attachments          IWhatsappAttachment[]  ({ url, name, type })
 *   replyToMessageId     string   wamid to quote
 *   quoteTriggerMessage  boolean  quote the message that started the run
 *   conversationId       string   override; normally taken from the trigger
 *
 * Delegates to `handleWhatsappMessage` rather than calling `sendWhatsappText`
 * directly. That function is the single path every agent reply already takes
 * (inbox UI -> conversationMessageAdd -> handleWhatsappIntegration), and it
 * owns behaviour this action must not reimplement: it resolves the integration
 * and conversation, uploads each attachment to Meta and sends it as media,
 * maps Meta's 131047 to the "outside the 24-hour service window" error, flips
 * the integration's healthStatus on an auth failure, and persists the sent
 * message so the reply appears in the agent's thread rather than only on the
 * customer's phone.
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

  const template = readTemplate(resolved.template);
  const attachments = Array.isArray(resolved.attachments)
    ? resolved.attachments
    : [];

  // A template needs no body text — it IS the message, and Meta renders it from
  // the approved definition. Everything else does.
  if (!text && !template && !attachments.length) {
    throw new Error(
      'WhatsApp message action requires text, a template, an attachment, or a preceding AI action that produced text',
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

  // Quote the message that started the run unless the workflow named another.
  // The trigger target's `_id` IS the inbound wamid, which is exactly what
  // Meta's context.message_id expects.
  const replyToMessageId =
    (typeof resolved.replyToMessageId === 'string' &&
      resolved.replyToMessageId) ||
    (resolved.quoteTriggerMessage === true &&
    typeof execution?.target?._id === 'string'
      ? execution.target._id
      : '');

  try {
    const sent = await handleWhatsappMessage(models, subdomain, {
      payload: JSON.stringify({
        conversationId,
        content: text,
        // No userId: this reply has no human author. handleWhatsappMessage
        // stores it as-is, which is what marks it a bot reply in the thread.
        attachments,
        // Quoting is optional; Meta rejects an unknown wamid, so only send one
        // the workflow actually supplied.
        ...(replyToMessageId ? { replyToMessageId } : {}),
        // handleWhatsappMessage reads the template off `extraInfo`, the same
        // envelope conversationMessageAdd uses when an agent picks a template
        // in the inbox.
        ...(template ? { extraInfo: { whatsappTemplate: template } } : {}),
      }),
    });

    return {
      result: {
        messageId: sent?._id,
        mid: sent?.mid,
        content: text,
        conversationId,
        templateName: template?.name,
        attachmentCount: attachments.length,
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
