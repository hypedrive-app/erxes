import { normalizePhone } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { receiveInboxMessage } from '~/modules/inbox/receiveMessage';
import { debugError } from '@/integrations/plivo/debuggers';
import {
  IPlivoCustomerDocument,
  IPlivoIntegrationDocument,
  IPlivoMessageAttachment,
} from '@/integrations/plivo/@types';

/**
 * Resolves a caller to a core contact, creating one if needed.
 *
 * Two records are involved: a plugin-local row keyed by the normalised number
 * for cheap callback lookups, and the core contact the inbox actually displays.
 * The number is normalised to E.164 BEFORE either is written, so a caller who
 * also messages on WhatsApp resolves to ONE contact — core matches
 * `primaryPhone` as an exact string and has no unique index to catch a
 * mismatch.
 *
 * If the core call fails the local row is removed again, so a later retry is
 * not blocked by a half-created customer that has no `erxesApiId`.
 *
 * @param rawPhone - the caller number as Plivo delivered it
 */
export const getOrCreateCustomer = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  rawPhone: string,
  displayName?: string,
): Promise<IPlivoCustomerDocument> => {
  const phoneNumber = normalizePhone(rawPhone, integration.defaultCountryCode);

  if (!phoneNumber) {
    throw new Error(`Unusable caller number: ${rawPhone}`);
  }

  const existing = await models.PlivoCustomers.findOne({ phoneNumber });

  if (existing) {
    return existing;
  }

  let customer: IPlivoCustomerDocument;

  try {
    customer = await models.PlivoCustomers.create({
      phoneNumber,
      primaryPhone: phoneNumber,
      firstName: displayName,
      integrationId: integration.erxesApiId,
    });
  } catch (e: any) {
    // A concurrent callback for the same caller won the race; use its row.
    // `code` is the reliable signal — the driver's message text is not a
    // contract, and mongoose surfaces the raw MongoServerError here.
    if (e.code === 11000 || e.message?.includes('duplicate')) {
      return await models.PlivoCustomers.getCustomer({ phoneNumber });
    }

    throw e;
  }

  try {
    const response = await receiveInboxMessage(subdomain, {
      action: 'get-create-update-customer',
      payload: JSON.stringify({
        integrationId: integration.erxesApiId,
        primaryPhone: phoneNumber,
        firstName: displayName,
        isUser: true,
      }),
    });

    if (response.status !== 'success') {
      throw new Error(`Customer creation failed: ${JSON.stringify(response)}`);
    }

    // The handler reports success even when core returned no contact, so the
    // id is checked rather than trusted — storing `undefined` here would leave
    // a local row that can never be matched to a contact again.
    const erxesApiId = response.data?._id;

    if (!erxesApiId) {
      throw new Error(
        `Customer creation returned no id: ${JSON.stringify(response)}`,
      );
    }

    customer.erxesApiId = erxesApiId;
    await customer.save();
  } catch (e: any) {
    await models.PlivoCustomers.deleteOne({ _id: customer._id });

    throw new Error(`Failed to sync with API: ${e.stack || e.message || e}`);
  }

  return customer;
};

/**
 * Creates the inbox conversation that surfaces a call to an agent.
 *
 * Unlike a chat thread there is one conversation per CALL, not per contact: a
 * call is a discrete event with its own duration, recording and outcome, and
 * folding several into one thread would lose the per-call detail that call
 * history is for.
 *
 * The id is stored on the local session row so the hangup and recording
 * callbacks can update the same conversation instead of raising a new one.
 */
export const createCallConversation = async (
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  customer: IPlivoCustomerDocument,
  callUuid: string,
  content: string,
): Promise<string> => {
  const response = await receiveInboxMessage(subdomain, {
    action: 'create-or-update-conversation',
    payload: JSON.stringify({
      customerId: customer.erxesApiId,
      integrationId: integration.erxesApiId,
      content,
    }),
  });

  if (response.status !== 'success') {
    throw new Error(
      `Conversation creation failed for call ${callUuid}: ${JSON.stringify(
        response,
      )}`,
    );
  }

  const conversationId = response.data?._id;

  // Without an id the session row would point at nothing and every later
  // callback would silently skip the inbox, so this fails loudly instead.
  if (!conversationId) {
    throw new Error(
      `Conversation creation returned no id for call ${callUuid}: ${JSON.stringify(
        response,
      )}`,
    );
  }

  return conversationId;
};

/** The call audio a message carries, when it carries any. */
export interface IPlivoCallMessageAudio {
  attachment: IPlivoMessageAttachment;
  /**
   * True when the audio is a voicemail rather than a recording of an answered
   * call. Sent as message `extraData` because the attachment shape has no room
   * for it and the inbox must not render the two alike — a voicemail is an
   * unhandled contact, a recording is a record of a handled one.
   */
  isVoicemail: boolean;
}

/** Everything beyond the text a call message may carry. */
export interface IPlivoCallMessageOptions {
  audio?: IPlivoCallMessageAudio;
  /**
   * Whether this message's text becomes the conversation's list preview.
   *
   * The preview must say what HAPPENED on the call — `Outgoing call — 53s` —
   * so only the messages that report the call's state claim it. The recording
   * lands on its own callback long after the outcome is known and is an
   * addendum to that call, not a newer fact about it; letting it take the
   * preview would overwrite a correct outcome with "Call recording" in every
   * inbox list.
   */
  replacesConversationContent: boolean;
  /**
   * The agent who placed the call, for an OUTBOUND call only.
   *
   * The inbox renders a message as agent-side or customer-side from `userId`
   * alone. A call message is written by a Plivo callback rather than by a person
   * typing, so without this every call — including one the agent placed
   * themselves — arrives with `userId` unset and renders left-aligned and
   * untinted, visually identical to an inbound message from the customer.
   *
   * It is deliberately NOT set for inbound calls: the customer initiated those,
   * so customer-side is the correct rendering and there is no agent to attribute
   * them to at the time the row is written.
   */
  userId?: string;
}

/**
 * Writes the call itself into the conversation so the agent sees a message
 * rather than an empty thread.
 *
 * `audio` carries the recording or voicemail when there is one. It is passed
 * through the SAME action as the text, matching how the WhatsApp integration
 * delivers media, because `create-conversation-message` is the only inbox
 * action that both stores a message and publishes the
 * `conversationMessageInserted` event an open inbox is subscribed to — an
 * update path would store the audio but leave every open inbox showing the
 * thread without it.
 *
 * Failure here is logged and swallowed: the conversation already exists and the
 * call session row is the durable record, so losing the rendered line is worth
 * less than rejecting the callback and having Plivo retry the whole call.
 */
export const createCallMessage = async (
  subdomain: string,
  conversationId: string,
  customerId: string | undefined,
  content: string,
  createdAt: Date,
  { audio, replacesConversationContent, userId }: IPlivoCallMessageOptions = {
    replacesConversationContent: true,
  },
): Promise<string> => {
  try {
    const response = await receiveInboxMessage(subdomain, {
      action: 'create-conversation-message',
      ...(replacesConversationContent ? { metaInfo: 'replaceContent' } : {}),
      payload: JSON.stringify({
        content,
        conversationId,
        customerId,
        createdAt,
        ...(userId ? { userId } : {}),
        ...(audio
          ? {
              attachments: [audio.attachment],
              extraData: { plivoIsVoicemail: audio.isVoicemail },
            }
          : {}),
      }),
    });

    if (response.status !== 'success') {
      throw new Error(JSON.stringify(response));
    }

    return response.data?._id || '';
  } catch (e: any) {
    debugError(
      `Failed to write call message for conversation ${conversationId}: ${e.message}`,
    );

    return '';
  }
};
