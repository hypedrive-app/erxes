import { FilterQuery } from 'mongoose';
import { sendTRPCMessage } from 'erxes-api-shared/utils';
import { IContext } from '~/connectionResolvers';
import {
  generatePlivoAccessToken,
  IPlivoAccessToken,
} from '@/integrations/plivo/accessToken';
import { ensurePlivoEndpoint } from '@/integrations/plivo/helpers';
import { debugError } from '@/integrations/plivo/debuggers';
import {
  IPlivoCallSessionDocument,
  PlivoCallDirection,
} from '@/integrations/plivo/@types';

/** What the widget needs to offer a number, and nothing more. */
export interface IPlivoSoftphoneIntegration {
  _id: string;
  name: string;
  phoneNumber?: string;
}

/** The contact a call is attributed to, as call history renders it. */
export interface IPlivoCallContact {
  _id: string;
  firstName?: string;
  lastName?: string;
  primaryPhone?: string;
  avatar?: string;
}

/** One row of call history. Carries no credential of any kind. */
export interface IPlivoCallHistory {
  _id: string;
  callUuid?: string;
  conversationId?: string;
  direction?: PlivoCallDirection;
  status?: string;
  from?: string;
  to?: string;
  counterpartNumber?: string;
  duration?: number;
  hangupCause?: string;
  recordUrl?: string;
  recordingDuration?: number;
  isVoicemail?: boolean;
  voicemailLeftAt?: Date;
  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  createdAt?: Date;
  customer: IPlivoCallContact | null;
}

export interface IPlivoCallHistoryList {
  list: IPlivoCallHistory[];
  totalCount: number;
}

export interface IPlivoCallHistoriesArgs {
  integrationId?: string;
  direction?: string;
  isVoicemail?: boolean;
  hasRecording?: boolean;
  searchValue?: string;
  limit?: number;
  skip?: number;
}

/** A page bigger than this is never what the caller wants, only what it costs. */
const PLIVO_CALL_HISTORY_MAX_LIMIT = 100;
const PLIVO_CALL_HISTORY_DEFAULT_LIMIT = 20;

/**
 * Neutralises regex metacharacters so a search term is matched literally.
 *
 * The search box takes phone numbers, and `+` — which starts every E.164
 * number — is a quantifier: pasting `+9761234` unescaped makes MongoDB reject
 * the pattern outright, turning a normal search into an error toast.
 */
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Only the two values the schema stores; anything else is not a filter. */
const isPlivoCallDirection = (
  value: string,
): value is PlivoCallDirection => value === 'inbound' || value === 'outbound';

/**
 * The number of the party that is NOT us.
 *
 * Call history is read as "who was on the call", so an inbound call shows its
 * caller and an outbound one shows who was dialled. Falling back to `from`
 * keeps a row with a missing leg readable instead of blank.
 */
const getCounterpartNumber = (
  session: Pick<IPlivoCallSessionDocument, 'direction' | 'from' | 'to'>,
): string | undefined =>
  session.direction === 'inbound' ? session.from : session.to || session.from;

export const plivoQueries = {
  /**
   * The Plivo numbers this agent can answer on in the browser.
   *
   * The floating softphone has no channel in scope — it is mounted app-wide —
   * so it cannot use the channel-scoped `integrations` list. This returns every
   * ACTIVE Plivo integration that is actually dialable, letting the widget
   * auto-select when there is exactly one and offer a picker when there are
   * several.
   *
   * Credentials never leave the server: only the id, name and caller id are
   * exposed, and a token still has to be minted through `plivoAccessToken`.
   *
   * An integration with no stored credentials is omitted rather than offered,
   * because picking it could only ever fail at the token step — which is the
   * dead end this query exists to remove.
   */
  plivoSoftphoneIntegrations: async (
    _root: undefined,
    _args: undefined,
    { models, user }: IContext,
  ): Promise<IPlivoSoftphoneIntegration[]> => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    const plivoIntegrations = await models.PlivoIntegrations.find({
      authId: { $nin: [null, ''] },
      authToken: { $nin: [null, ''] },
      erxesApiId: { $nin: [null, ''] },
    }).lean();

    if (!plivoIntegrations.length) {
      return [];
    }

    // The inbox row is the authority on the name the agent recognises and on
    // whether the integration is still active; an archived one must not be
    // offered as somewhere to receive calls.
    const inboxIntegrations = await models.Integrations.find({
      _id: { $in: plivoIntegrations.map((integration) => integration.erxesApiId) },
      isActive: { $ne: false },
    }).lean();

    const phoneNumberById = new Map(
      plivoIntegrations.map((integration) => [
        integration.erxesApiId,
        integration.plivoPhoneNumber,
      ]),
    );

    return inboxIntegrations.map((integration) => {
      const phoneNumber = phoneNumberById.get(integration._id);

      return {
        _id: integration._id,
        // `name` is optional on the inbox row, and an unnamed integration must
        // still be pickable — the number it dials from identifies it well
        // enough for the widget's list.
        name: integration.name || phoneNumber || integration._id,
        phoneNumber,
      };
    });
  },

  /**
   * Mints a browser softphone access token for the requesting agent.
   *
   * This resolver deliberately carries NO `wrapperConfig`, so the plugin's
   * Apollo wrapper applies `wrapPermission` and rejects an anonymous caller
   * before the body runs — minting calling credentials must never be reachable
   * without a session.
   *
   * The account's `authId`/`authToken` stay on the server: the auth token is
   * used only as the signing key, so what the browser receives is a token
   * scoped to one endpoint that expires on its own.
   */
  plivoAccessToken: async (
    _root: undefined,
    { integrationId }: { integrationId: string },
    { models, user }: IContext,
  ): Promise<IPlivoAccessToken & { phoneNumber?: string }> => {
    // This mints credentials that can place and receive calls on the account,
    // so an unauthenticated caller must never reach the signing step. The
    // endpoint username is derived from the user id as well, which would be
    // meaningless without one.
    if (!user?._id) {
      throw new Error('Login required');
    }

    const integration = await models.PlivoIntegrations.getIntegration({
      erxesApiId: integrationId,
    });

    const { authId, authToken, appId, plivoPhoneNumber } = integration;

    if (!authId || !authToken) {
      throw new Error(
        'This Plivo integration has no credentials stored. Reconnect it before calling from the browser.',
      );
    }

    // A token on its own does not make the browser reachable — `<Dial><User>`
    // can only ring a SIP endpoint that exists — so one is provisioned before
    // the token is minted. One endpoint per agent per integration: two browsers
    // sharing a username would race for the same registration and only the last
    // one would ring.
    const endpoint = await ensurePlivoEndpoint({
      authId,
      authToken,
      integrationId,
      userId: user._id,
      appId,
    });

    // Plivo appends a 12-digit number to the requested username, so the token's
    // `sub` and the SIP URI must both use the name Plivo actually assigned.
    const accessToken = generatePlivoAccessToken({
      authId,
      authToken,
      username: endpoint.username,
      appId,
    });

    return { ...accessToken, phoneNumber: plivoPhoneNumber };
  },

  /**
   * A page of call history for the Plivo numbers this account has connected.
   *
   * Like `plivoAccessToken` this resolver carries NO `wrapperConfig`, so the
   * plugin's Apollo wrapper applies `wrapPermission` and rejects an anonymous
   * caller before the body runs. Call history is a log of who spoke to whom
   * and a link to the audio of it; it must never be readable without a session.
   *
   * Rows are read newest-first, which is the order the `{ integrationId,
   * createdAt }` index is built for.
   *
   * `totalCount` is returned alongside the page rather than as a second query
   * so the list can render "load more" from one round trip and cannot show a
   * count that disagrees with the rows beneath it.
   *
   * Contacts are resolved in ONE batched lookup for the whole page. Resolving
   * per row — which is what letting the client fetch each customer would do —
   * turns a 20-row page into 20 round trips to core.
   */
  plivoCallHistories: async (
    _root: undefined,
    {
      integrationId,
      direction,
      isVoicemail,
      hasRecording,
      searchValue,
      limit,
      skip,
    }: IPlivoCallHistoriesArgs,
    { models, subdomain, user }: IContext,
  ): Promise<IPlivoCallHistoryList> => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    const selector: FilterQuery<IPlivoCallSessionDocument> = {};

    if (integrationId) {
      selector.integrationId = integrationId;
    }

    // An unrecognised direction must not silently widen the result to
    // everything — that would show outbound calls under an "incoming" tab.
    if (direction) {
      if (!isPlivoCallDirection(direction)) {
        throw new Error(
          `Unknown call direction "${direction}". Expected "inbound" or "outbound".`,
        );
      }

      selector.direction = direction;
    }

    // `isVoicemail` is unset on every row written before voicemail existed and
    // on every call that simply has no voicemail, so "not a voicemail" has to
    // mean "flag is false OR absent" rather than `false`.
    if (isVoicemail === true) {
      selector.isVoicemail = true;
    } else if (isVoicemail === false) {
      selector.isVoicemail = { $ne: true };
    }

    if (hasRecording === true) {
      selector.recordUrl = { $nin: [null, ''] };
    } else if (hasRecording === false) {
      selector.recordUrl = { $in: [null, ''] };
    }

    if (searchValue) {
      const pattern = new RegExp(escapeRegExp(searchValue), 'i');
      selector.$or = [{ from: pattern }, { to: pattern }];
    }

    const pageSize = Math.min(
      Math.max(limit ?? PLIVO_CALL_HISTORY_DEFAULT_LIMIT, 1),
      PLIVO_CALL_HISTORY_MAX_LIMIT,
    );

    const [sessions, totalCount] = await Promise.all([
      models.PlivoCallSessions.find(selector)
        .sort({ createdAt: -1 })
        .skip(Math.max(skip ?? 0, 0))
        .limit(pageSize)
        .lean(),
      models.PlivoCallSessions.countDocuments(selector),
    ]);

    const customerIds = Array.from(
      new Set(
        sessions
          .map((session) => session.customerId)
          .filter((customerId): customerId is string => !!customerId),
      ),
    );

    const customersById = new Map<string, IPlivoCallContact>();

    if (customerIds.length) {
      // A failed contacts lookup must not blank the call log: the numbers,
      // durations and recordings are all on the session rows and remain
      // readable without a name attached.
      try {
        const customers = await sendTRPCMessage({
          subdomain,
          pluginName: 'core',
          method: 'query',
          module: 'customers',
          action: 'find',
          input: { query: { _id: { $in: customerIds } } },
        });

        for (const customer of (customers as IPlivoCallContact[]) || []) {
          if (customer?._id) {
            customersById.set(customer._id, {
              _id: customer._id,
              firstName: customer.firstName,
              lastName: customer.lastName,
              primaryPhone: customer.primaryPhone,
              avatar: customer.avatar,
            });
          }
        }
      } catch (e) {
        // Logged, not thrown — see above.
        debugError(
          `Failed to resolve contacts for Plivo call history: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    const list = sessions.map((session) => ({
      _id: session._id,
      callUuid: session.callUuid,
      conversationId: session.erxesApiConversationId,
      direction: session.direction,
      status: session.status,
      from: session.from,
      to: session.to,
      counterpartNumber: getCounterpartNumber(session),
      duration: session.duration,
      hangupCause: session.hangupCause,
      recordUrl: session.recordUrl,
      recordingDuration: session.recordingDuration,
      isVoicemail: session.isVoicemail,
      voicemailLeftAt: session.voicemailLeftAt,
      startedAt: session.startedAt,
      answeredAt: session.answeredAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
      customer: session.customerId
        ? customersById.get(session.customerId) ?? null
        : null,
    }));

    return { list, totalCount };
  },
};
