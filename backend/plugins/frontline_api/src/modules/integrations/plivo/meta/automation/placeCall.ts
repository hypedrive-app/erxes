import { replaceOutputPlaceholders } from 'erxes-api-shared/core-modules';
import { IModels } from '~/connectionResolvers';
import { handlePlivoClickToCall } from '@/integrations/plivo/handlePlivoCall';
import { debugError } from '@/integrations/plivo/debuggers';

type TPlaceCallParams = {
  models: IModels;
  subdomain: string;
  action: any;
  execution: any;
};

/**
 * Places a call from an automation.
 *
 * Config keys:
 *   to             string  number to reach; falls back to the trigger's caller
 *   userId         string  REQUIRED — the agent whose softphone rings first
 *   integrationId  string  which connected number to call from
 *   callerName     string  label shown on the agent's widget
 *
 * `userId` has no sensible default and so is required rather than guessed. A
 * click-to-call rings ONE agent's browser softphone and only bridges the
 * customer once that agent answers; picking an arbitrary agent would ring
 * somebody who has no idea why, and picking the call's previous handler would
 * silently re-route a follow-up to whoever happened to take the last call.
 *
 * `to` falls back to the trigger's `from` because the overwhelmingly common
 * workflow is calling back somebody whose call was missed — the number is right
 * there on the target, and requiring it to be retyped invites a typo.
 *
 * Delegates to `handlePlivoClickToCall`, the same function the inbox's own call
 * button uses, so an automation-placed call resolves the endpoint, provisions
 * the SIP softphone and reports auth failures exactly as an agent-placed one
 * does. Reimplementing any of that here would let the two diverge.
 */
export const actionPlacePlivoCall = async ({
  models,
  subdomain,
  action,
  execution,
}: TPlaceCallParams) => {
  const resolved = (await replaceOutputPlaceholders({
    subdomain,
    execution,
    values: (action.config || {}) as Record<string, unknown>,
    defaultValue: '',
  })) as Record<string, unknown>;

  const to =
    (typeof resolved.to === 'string' && resolved.to.trim()) ||
    (typeof execution?.target?.from === 'string'
      ? execution.target.from.trim()
      : '');

  if (!to) {
    throw new Error(
      'Place a Call needs a number: set one on the action, or enrol this workflow from a trigger that carries the caller.',
    );
  }

  const userId =
    typeof resolved.userId === 'string' ? resolved.userId.trim() : '';

  if (!userId) {
    throw new Error(
      'Place a Call needs the agent whose softphone should ring — there is no safe default, so pick one on the action.',
    );
  }

  const integrationId =
    (typeof resolved.integrationId === 'string' &&
      resolved.integrationId.trim()) ||
    (typeof execution?.target?.integrationId === 'string'
      ? execution.target.integrationId
      : '');

  if (!integrationId) {
    throw new Error(
      'Place a Call needs the Plivo integration to call from; set one on the action.',
    );
  }

  try {
    const { requestUuid } = await handlePlivoClickToCall(models, subdomain, {
      integrationId,
      userId,
      to,
      callerName:
        typeof resolved.callerName === 'string'
          ? resolved.callerName
          : undefined,
    });

    return { result: { requestUuid, to, userId } };
  } catch (e) {
    // Surfaced on the execution rather than swallowed: a dead token and an
    // unreachable number both arrive here as plain Errors carrying a message
    // an operator can act on.
    debugError(`Plivo automation call failed: ${(e as Error).message}`);
    throw e;
  }
};
