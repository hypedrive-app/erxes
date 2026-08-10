import {
  TAiContext,
  TAutomationProducers,
  TAutomationProducersInput,
} from 'erxes-api-shared/core-modules';
import { IModels } from '~/connectionResolvers';
import { WHATSAPP_MESSAGE_COLLECTION } from '@/integrations/whatsapp/constants';
import {
  TWhatsappTriggerConfig,
  TWhatsappTriggerTarget,
} from '@/integrations/whatsapp/meta/automation/types';

const toFilterList = (value: unknown): string[] =>
  (typeof value === 'string' ? value : '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const toISOString = (value?: Date | string) => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
};

// An execution can start seconds after its message, by which time newer
// messages exist. History must stay strictly older than the one being handled.
const toHistoryCutoff = (value?: Date | string) => {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

// WhatsApp has no `fromBot` flag: inbound customer messages and our own
// outbound replies live in the same collection, distinguished by `userId`
// (set only when an erxes user sent it).
const toHistoryRole = (message: { userId?: string }) =>
  message.userId ? ('agent' as const) : ('customer' as const);

export const whatsappAutomationWorkers = {
  checkCustomTrigger: (
    {
      collectionType,
      target,
      config,
    }: TAutomationProducersInput[TAutomationProducers.CHECK_CUSTOM_TRIGGER],
    _ctx: { models: IModels; subdomain: string },
  ) => {
    if (collectionType === WHATSAPP_MESSAGE_COLLECTION) {
      const triggerTarget = target as TWhatsappTriggerTarget;
      const triggerConfig = config as TWhatsappTriggerConfig | undefined;

      const keywords = toFilterList(triggerConfig?.keywords);
      const content = String(triggerTarget?.content || '').toLowerCase();

      // No keywords configured means "every message", which is the common case
      // for an AI agent answering everything.
      return (
        !keywords.length || keywords.some((keyword) => content.includes(keyword))
      );
    }

    return false;
  },

  generateAiContext: async (
    {
      target,
      triggerType,
    }: TAutomationProducersInput[TAutomationProducers.GENERATE_AI_CONTEXT],
    { models }: { models: IModels },
  ): Promise<TAiContext | null> => {
    if (!target) {
      return null;
    }

    const triggerTarget = target as TWhatsappTriggerTarget;

    const context: TAiContext = {
      version: 1,
      input: {
        text:
          typeof triggerTarget.content === 'string'
            ? triggerTarget.content
            : '',
        id: triggerTarget._id,
        createdAt: toISOString(triggerTarget.createdAt),
      },
      facts: {
        conversationId: triggerTarget.conversationId,
        customerId: triggerTarget.customerId,
        from: triggerTarget.from,
        triggerType,
      },
      memory: {
        scopeKey:
          (typeof triggerTarget.conversationId === 'string' &&
            triggerTarget.conversationId.trim()) ||
          (typeof triggerTarget.customerId === 'string' &&
            triggerTarget.customerId.trim()) ||
          undefined,
      },
    };

    const conversation = await models.WhatsappConversations.findOne({
      erxesApiId: triggerTarget.conversationId,
    });

    if (!conversation) {
      return context;
    }

    const historyCutoff = toHistoryCutoff(triggerTarget.createdAt);
    const messages = await models.WhatsappConversationMessages.find({
      conversationId: conversation._id,
      internal: { $ne: true },
      mid: { $ne: triggerTarget._id },
      ...(historyCutoff ? { createdAt: { $lt: historyCutoff } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();

    context.history = messages.reverse().map((message) => ({
      role: toHistoryRole(message),
      text: message.content || '',
      createdAt: toISOString(message.createdAt),
    }));

    return context;
  },
};
