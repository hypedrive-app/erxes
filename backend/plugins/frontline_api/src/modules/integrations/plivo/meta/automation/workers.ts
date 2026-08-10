import {
  TAiContext,
  TAutomationProducers,
  TAutomationProducersInput,
} from 'erxes-api-shared/core-modules';
import { IModels } from '~/connectionResolvers';
import { PLIVO_CALL_COLLECTION } from '@/integrations/plivo/constants';
import {
  TPlivoTriggerConfig,
  TPlivoTriggerTarget,
} from '@/integrations/plivo/meta/automation/types';
import { actionPlacePlivoCall } from '@/integrations/plivo/meta/automation/placeCall';

const toFilterList = (value: unknown): string[] =>
  (typeof value === 'string' ? value : '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const toISOString = (value?: Date | string) => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
};

/**
 * Describes a finished call in one line, for an AI agent's input.
 *
 * A call has no message body, so unlike WhatsApp there is nothing to hand an AI
 * step verbatim. This is the closest honest equivalent: the facts of the call,
 * stated plainly, so a summarise-and-follow-up workflow has something to work
 * from rather than an empty string.
 */
const describeCall = (target: TPlivoTriggerTarget): string => {
  const who = target.direction === 'outbound' ? `to ${target.to}` : `from ${target.from}`;

  if (target.isVoicemail) {
    return `Voicemail ${who}.`;
  }

  if (target.status === 'completed') {
    return `Answered call ${who}, lasting ${target.duration} seconds.`;
  }

  return `Unanswered call ${who} (${target.status}).`;
};

export const plivoAutomationWorkers = {
  receiveActions: async (
    {
      action,
      execution,
      collectionType,
    }: TAutomationProducersInput[TAutomationProducers.RECEIVE_ACTIONS],
    { models, subdomain }: { models: IModels; subdomain: string },
  ) => {
    if (collectionType === PLIVO_CALL_COLLECTION) {
      return await actionPlacePlivoCall({
        models,
        subdomain,
        action,
        execution,
      });
    }

    return { result: null };
  },

  checkCustomTrigger: (
    {
      collectionType,
      target,
      config,
    }: TAutomationProducersInput[TAutomationProducers.CHECK_CUSTOM_TRIGGER],
    _ctx: { models: IModels; subdomain: string },
  ) => {
    if (collectionType !== PLIVO_CALL_COLLECTION) {
      return false;
    }

    const triggerTarget = target as TPlivoTriggerTarget;
    const triggerConfig = config as TPlivoTriggerConfig | undefined;

    // Both filters unset means "every call", which is what a logging or
    // follow-up workflow wants.
    const direction = String(triggerConfig?.direction || '')
      .trim()
      .toLowerCase();

    if (direction && direction !== String(triggerTarget?.direction || '')) {
      return false;
    }

    const statuses = toFilterList(triggerConfig?.statuses);

    if (
      statuses.length &&
      !statuses.includes(String(triggerTarget?.status || '').toLowerCase())
    ) {
      return false;
    }

    return true;
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

    const triggerTarget = target as TPlivoTriggerTarget;

    const context: TAiContext = {
      version: 1,
      input: {
        text: describeCall(triggerTarget),
        id: triggerTarget._id,
        createdAt: toISOString(triggerTarget.createdAt),
      },
      facts: {
        conversationId: triggerTarget.conversationId,
        customerId: triggerTarget.customerId,
        direction: triggerTarget.direction,
        status: triggerTarget.status,
        duration: triggerTarget.duration,
        from: triggerTarget.from,
        to: triggerTarget.to,
        triggerType,
      },
      memory: {
        // Keyed on the customer rather than the conversation: a caller who
        // rings three times produces three conversations but is one person,
        // and the useful memory spans all of them.
        scopeKey:
          (typeof triggerTarget.customerId === 'string' &&
            triggerTarget.customerId.trim()) ||
          (typeof triggerTarget.conversationId === 'string' &&
            triggerTarget.conversationId.trim()) ||
          undefined,
      },
    };

    if (!triggerTarget.customerId) {
      return context;
    }

    // Their previous calls, so a workflow can tell a first-time caller from
    // somebody who has now been missed four times. Strictly older than this
    // one: an execution can start after later calls already exist.
    const cutoff = triggerTarget.createdAt
      ? new Date(String(triggerTarget.createdAt))
      : undefined;

    const previous = await models.PlivoCallSessions.find({
      customerId: triggerTarget.customerId,
      callUuid: { $ne: triggerTarget._id },
      endedAt: { $exists: true },
      ...(cutoff && !Number.isNaN(cutoff.getTime())
        ? { endedAt: { $lt: cutoff, $exists: true } }
        : {}),
    })
      .sort({ endedAt: -1 })
      .limit(10)
      .lean();

    context.history = previous.reverse().map((call) => ({
      role: call.direction === 'outbound' ? ('agent' as const) : ('customer' as const),
      text: describeCall(call as unknown as TPlivoTriggerTarget),
      createdAt: toISOString(call.endedAt),
    }));

    return context;
  },
};
