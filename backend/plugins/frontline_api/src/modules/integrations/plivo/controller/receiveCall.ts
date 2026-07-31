import { normalizePhone } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { debugError, debugPlivo } from '@/integrations/plivo/debuggers';
import {
  createCallConversation,
  createCallMessage,
  getOrCreateCustomer,
} from '@/integrations/plivo/controller/store';
import { rehostPlivoRecording } from '@/integrations/plivo/rehostRecording';
import {
  PLIVO_BUSY_HANGUP_CAUSES,
  PLIVO_FAILED_HANGUP_CAUSES,
  PLIVO_UNANSWERED_HANGUP_CAUSES,
} from '@/integrations/plivo/constants';
import {
  IPlivoCallbackParams,
  IPlivoCallSessionDocument,
  IPlivoIntegrationDocument,
  PlivoCallDirection,
  PlivoCallStatus,
} from '@/integrations/plivo/@types';

/** Plivo only ever reports these two; anything else is treated as inbound. */
const readDirection = (value?: string): PlivoCallDirection =>
  value === 'outbound' ? 'outbound' : 'inbound';

/** Every callback value is a form-encoded string, including the numbers. */
const readNumber = (value?: string): number | undefined => {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Derives the final status from the hangup cause.
 *
 * Plivo reports `CallStatus: completed` for every call that ends, whether it
 * was answered or rang out, so the cause is the only signal that distinguishes
 * a real conversation from a missed call. A zero duration alone is not enough —
 * an answered call hung up immediately also bills zero seconds.
 * https://www.plivo.com/docs/voice/api/call#hangup-causes
 */
const readFinalStatus = (
  hangupCause: string | undefined,
  duration: number | undefined,
): PlivoCallStatus => {
  const cause = (hangupCause || '').toUpperCase();

  if ((PLIVO_BUSY_HANGUP_CAUSES as readonly string[]).includes(cause)) {
    return 'busy';
  }

  if ((PLIVO_FAILED_HANGUP_CAUSES as readonly string[]).includes(cause)) {
    return 'failed';
  }

  if ((PLIVO_UNANSWERED_HANGUP_CAUSES as readonly string[]).includes(cause)) {
    return 'no-answer';
  }

  // NORMAL_CLEARING with nothing connected is still a call nobody picked up.
  if (!duration) {
    return 'no-answer';
  }

  return 'completed';
};

/** The line the agent reads in the inbox for a ringing call. */
const describeRingingCall = (
  direction: PlivoCallDirection,
  from: string,
  to: string,
): string =>
  direction === 'inbound'
    ? `Incoming call from ${from}`
    : `Outgoing call to ${to}`;

/** The line the agent reads once the call has ended. */
const describeEndedCall = (
  direction: PlivoCallDirection,
  status: PlivoCallStatus,
  duration: number | undefined,
): string => {
  if (status !== 'completed') {
    return direction === 'inbound'
      ? `Missed call (${status})`
      : `Call not answered (${status})`;
  }

  const seconds = duration || 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  const length = minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;

  return direction === 'inbound'
    ? `Incoming call — ${length}`
    : `Outgoing call — ${length}`;
};

/**
 * The line the agent reads when a caller left a voicemail.
 *
 * Worded so it is unmistakably an unhandled contact rather than a recording of
 * a conversation that already happened, matching how mature platforms surface a
 * voicemail as work still to do.
 */
const describeVoicemail = (duration: number | undefined): string =>
  duration
    ? `Missed call — voicemail (${duration}s)`
    : 'Missed call — voicemail';

/**
 * Records a call the moment Plivo asks us how to answer it.
 *
 * The session row is written BEFORE any XML is returned, because its unique
 * `callUuid` is what makes a redelivered answer callback a no-op — Plivo retries
 * when our reply is slow, and without the row already stored the retry would
 * raise a second conversation for the same call.
 *
 * The customer and conversation are created here rather than on hangup so the
 * call appears in the inbox while it is still ringing; the hangup callback then
 * only has to fill in the outcome.
 */
export const registerIncomingCall = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): Promise<IPlivoCallSessionDocument | null> => {
  const callUuid = params.CallUUID;

  if (!callUuid) {
    return null;
  }

  const existing = await models.PlivoCallSessions.findOne({ callUuid });

  if (existing) {
    debugPlivo(`Ignoring already-registered call ${callUuid}`);
    return existing;
  }

  const direction = readDirection(params.Direction);
  const from = normalizePhone(params.From, integration.defaultCountryCode);
  const to = normalizePhone(params.To, integration.defaultCountryCode);

  // The party that is not our own number is the contact, whichever way the
  // call was placed.
  const customerNumber = direction === 'inbound' ? from : to;

  const customer = await getOrCreateCustomer(
    models,
    subdomain,
    integration,
    customerNumber,
  );

  const startedAt = new Date();
  const content = describeRingingCall(direction, from, to);

  const session = await models.PlivoCallSessions.addCallSession({
    callUuid,
    integrationId: integration.erxesApiId,
    customerId: customer.erxesApiId,
    direction,
    status: 'ringing',
    from,
    to,
    startedAt,
  });

  // addCallSession returns the pre-existing row when a concurrent delivery of
  // the same callback already registered the call. That delivery owns the
  // conversation, so stop rather than raising a duplicate — and never roll the
  // row back below, because deleting it would destroy the winner's record.
  const isOurs = session.startedAt?.getTime() === startedAt.getTime();

  if (!isOurs || session.erxesApiConversationId) {
    return session;
  }

  try {
    const conversationId = await createCallConversation(
      subdomain,
      integration,
      customer,
      callUuid,
      content,
    );

    session.erxesApiConversationId = conversationId;
    session.erxesApiMessageId = await createCallMessage(
      subdomain,
      conversationId,
      customer.erxesApiId,
      content,
      startedAt,
    );
    await session.save();
  } catch (e: any) {
    // Roll the local row back so a Plivo retry is reprocessed rather than being
    // silently swallowed by the callUuid check above.
    await models.PlivoCallSessions.deleteOne({ _id: session._id });

    throw new Error(
      `Failed to deliver Plivo call ${callUuid} to inbox: ${e.message}`,
    );
  }

  return session;
};

/**
 * Records a call an agent placed from their browser softphone.
 *
 * Separate from {@link registerIncomingCall} because the two disagree on every
 * field that matters. Plivo labels a softphone-originated leg `inbound` — it is
 * inbound to the platform — and sends the agent's SIP URI as `From`, so reusing
 * the inbound path would store the direction backwards and try to resolve a
 * `sip:` URI as the contact's phone number.
 *
 * Both numbers are rewritten to what a human would recognise: the integration's
 * own number as `from`, since that is the CLI the callee actually sees, and the
 * dialled number as `to`. The agent is recorded as `userId` so the call is
 * attributable in history, which is the whole reason the endpoint credential is
 * resolved on the callback path.
 *
 * Written before any XML is returned, for the same reason as the inbound path:
 * the unique `callUuid` is what makes a redelivered answer callback a no-op.
 */
export const registerOutgoingCall = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  userId: string,
  params: IPlivoCallbackParams,
): Promise<IPlivoCallSessionDocument | null> => {
  const callUuid = params.CallUUID;

  if (!callUuid) {
    return null;
  }

  const existing = await models.PlivoCallSessions.findOne({ callUuid });

  if (existing) {
    debugPlivo(`Ignoring already-registered call ${callUuid}`);
    return existing;
  }

  const to = normalizePhone(params.To, integration.defaultCountryCode);

  if (!to) {
    throw new Error(
      `Outgoing Plivo call ${callUuid} dialled an unusable number: ${params.To}`,
    );
  }

  const customer = await getOrCreateCustomer(models, subdomain, integration, to);

  const startedAt = new Date();
  const content = describeRingingCall('outbound', integration.plivoPhoneNumber, to);

  const session = await models.PlivoCallSessions.addCallSession({
    callUuid,
    integrationId: integration.erxesApiId,
    customerId: customer.erxesApiId,
    userId,
    direction: 'outbound',
    status: 'ringing',
    // The agent's SIP URI is not a number anyone can call back, so the
    // integration's own number — the CLI `<Dial callerId>` presents — is what
    // is stored and shown.
    from: integration.plivoPhoneNumber,
    to,
    startedAt,
  });

  // See registerIncomingCall: a concurrent delivery that won the race owns the
  // conversation, and its row must never be rolled back below.
  const isOurs = session.startedAt?.getTime() === startedAt.getTime();

  if (!isOurs || session.erxesApiConversationId) {
    return session;
  }

  try {
    const conversationId = await createCallConversation(
      subdomain,
      integration,
      customer,
      callUuid,
      content,
    );

    session.erxesApiConversationId = conversationId;
    session.erxesApiMessageId = await createCallMessage(
      subdomain,
      conversationId,
      customer.erxesApiId,
      content,
      startedAt,
    );
    await session.save();
  } catch (e: any) {
    // Roll back so a Plivo retry is reprocessed rather than swallowed by the
    // callUuid check above.
    await models.PlivoCallSessions.deleteOne({ _id: session._id });

    throw new Error(
      `Failed to deliver Plivo call ${callUuid} to inbox: ${e.message}`,
    );
  }

  return session;
};

/**
 * Applies the hangup callback: final status, duration, cost and cause.
 *
 * A hangup for a call we never registered is ignored rather than back-filled —
 * without an answer callback there was no conversation for an agent to see, and
 * inventing one after the fact would surface a call that already ended.
 */
export const registerCallHangup = async (
  models: IModels,
  subdomain: string,
  params: IPlivoCallbackParams,
): Promise<void> => {
  const callUuid = params.CallUUID;

  if (!callUuid) {
    return;
  }

  const duration = readNumber(params.Duration);
  // Plivo names the reason `HangupCause` on some flows and `HangupCauseName` on
  // others; whichever arrived is the one to classify on.
  const hangupCause = params.HangupCause || params.HangupCauseName;
  const status = readFinalStatus(hangupCause, duration);
  const endedAt = new Date();

  const answeredAtValue = params.AnswerTime
    ? new Date(params.AnswerTime)
    : undefined;
  const answeredAt =
    answeredAtValue && !Number.isNaN(answeredAtValue.getTime())
      ? answeredAtValue
      : undefined;

  // A hangup can overtake the answer callback, which is still writing the row
  // when this arrives. Claiming the outcome with a conditional update rather
  // than a read-then-save means the last writer cannot lose it, and `endedAt`
  // being unset is what makes a redelivered hangup a no-op.
  const claimed = await models.PlivoCallSessions.findOneAndUpdate(
    { callUuid, endedAt: { $exists: false } },
    {
      $set: {
        status,
        duration,
        billDuration: readNumber(params.BillDuration),
        totalCost: readNumber(params.TotalCost),
        hangupCause,
        endedAt,
        updatedAt: endedAt,
        ...(answeredAt ? { answeredAt } : {}),
      },
    },
    { new: true },
  );

  if (!claimed) {
    // Either the call was never registered, or another delivery already
    // recorded the outcome. Both are no-ops rather than errors.
    debugPlivo(`No open Plivo call to hang up for ${callUuid}`);
    return;
  }

  const session = claimed;

  if (!session.erxesApiConversationId) {
    return;
  }

  // The outcome is what the agent needs to see, so it replaces the "ringing"
  // line rather than being appended below it.
  await createCallMessage(
    subdomain,
    session.erxesApiConversationId,
    session.customerId,
    describeEndedCall(session.direction, status, duration),
    endedAt,
  );
};

/**
 * Stores a voicemail the caller left because nobody answered.
 *
 * A voicemail is deliberately NOT treated as a call recording: the recording
 * callback attaches audio to a call that happened, while this one records an
 * unhandled contact that still needs an agent. Both live on the same session row
 * — one call is one row — but `isVoicemail` keeps them apart, and the inbox gets
 * a message saying a voicemail is waiting rather than a bare missed call.
 *
 * The audio is re-hosted through the same durability path as a recording, so it
 * outlives Plivo's 90-day free storage window.
 *
 * The session may legitimately be missing when the answer callback failed to
 * register the call; the audio is still worth keeping, so the re-host runs
 * regardless and only the inbox update is skipped.
 */
export const registerCallVoicemail = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): Promise<void> => {
  if (!params.RecordUrl) {
    return;
  }

  // Same identifier fallback as the recording callback: Plivo does not document
  // CallUUID among a `<Record>` action's parameters, so RecordingID is used
  // when it is absent rather than silently dropping the voicemail.
  const selector = params.CallUUID
    ? { callUuid: params.CallUUID }
    : params.RecordingID
      ? { recordingUuid: params.RecordingID }
      : undefined;

  if (!selector) {
    debugError(
      `Voicemail callback carried neither CallUUID nor RecordingID; cannot attach ${params.RecordUrl}`,
    );
    return;
  }

  const seconds = readNumber(params.RecordingDuration);
  const milliseconds = readNumber(params.RecordingDurationMs);
  const recordingDuration =
    seconds !== undefined
      ? seconds
      : milliseconds === undefined
        ? undefined
        : Math.round(milliseconds / 1000);

  const { storageKey } = await rehostPlivoRecording({
    subdomain,
    recordUrl: params.RecordUrl,
    callUuid: params.CallUUID,
    authId: integration.authId,
    authToken: integration.authToken,
  });

  const leftAt = new Date();

  const session = await models.PlivoCallSessions.findOneAndUpdate(
    selector,
    {
      $set: {
        // The storage key when the copy succeeded, else Plivo's URL so the
        // voicemail is still playable until the provider deletes it.
        recordUrl: storageKey || params.RecordUrl,
        providerRecordUrl: params.RecordUrl,
        recordingUuid: params.RecordingID,
        recordingDuration,
        isVoicemail: true,
        voicemailLeftAt: leftAt,
        updatedAt: leftAt,
        ...(storageKey ? { recordingStoredAt: leftAt } : {}),
      },
    },
    { new: true },
  );

  if (!session) {
    debugError(
      `Voicemail callback matched no call session (${JSON.stringify(selector)})`,
    );
    return;
  }

  if (!session.erxesApiConversationId) {
    return;
  }

  // The voicemail is what the agent must act on, so it replaces the ringing
  // line in the conversation list rather than being buried beneath it.
  await createCallMessage(
    subdomain,
    session.erxesApiConversationId,
    session.customerId,
    describeVoicemail(recordingDuration),
    leftAt,
  );
};

/**
 * Stores the recording once Plivo has finished writing the file.
 *
 * Plivo stores recordings free for 90 days and bills for storage after that, so
 * the file is copied into erxes storage and the resulting key is what the player
 * reads, matching what the Grandstream integration already does.
 *
 * The download runs inside this call, which the recording webhook only reaches
 * AFTER it has acknowledged Plivo with a 200, so a slow copy cannot make Plivo
 * redeliver the callback.
 *
 * The provider URL is always stored too, and is used as `recordUrl` when the
 * copy fails: a recording still hosted by Plivo is worth more than none.
 */
export const registerCallRecording = async (
  models: IModels,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): Promise<void> => {
  if (!params.RecordUrl) {
    return;
  }

  // Plivo's documented parameter table for this callback lists RecordUrl,
  // RecordingID and the timing fields but does NOT clearly list CallUUID.
  // Keying on CallUUID alone would mean that if it is absent, every recording
  // silently fails to attach and only a debug line records the loss. So the
  // session is matched on whichever identifier actually arrived, preferring
  // CallUUID when present.
  const selector = params.CallUUID
    ? { callUuid: params.CallUUID }
    : params.RecordingID
      ? { recordingUuid: params.RecordingID }
      : undefined;

  if (!selector) {
    debugError(
      `Recording callback carried neither CallUUID nor RecordingID; cannot attach ${params.RecordUrl}`,
    );
    return;
  }

  // `RecordingDuration` is already in SECONDS, matching every other duration on
  // the session; the millisecond value is a separate `RecordingDurationMs`
  // parameter that ships alongside `RecordingStartMs`/`RecordingEndMs`. It is
  // used as the fallback so a callback that only carries the millisecond form
  // still records a duration.
  // https://www.plivo.com/docs/voice/xml/record
  const recordingSeconds = readNumber(params.RecordingDuration);
  const recordingMs = readNumber(params.RecordingDurationMs);
  const recordingDuration =
    recordingSeconds !== undefined
      ? recordingSeconds
      : recordingMs === undefined
        ? undefined
        : Math.round(recordingMs / 1000);

  const { storageKey } = await rehostPlivoRecording({
    subdomain,
    recordUrl: params.RecordUrl,
    callUuid: params.CallUUID,
    authId: integration.authId,
    authToken: integration.authToken,
  });

  const updated = await models.PlivoCallSessions.updateOne(
    selector,
    {
      $set: {
        // The storage key when the copy succeeded, else Plivo's URL so the
        // recording is still playable until the provider deletes it.
        recordUrl: storageKey || params.RecordUrl,
        providerRecordUrl: params.RecordUrl,
        recordingUuid: params.RecordingID,
        recordingDuration,
        updatedAt: new Date(),
        ...(storageKey ? { recordingStoredAt: new Date() } : {}),
      },
    },
  );

  if (!updated.matchedCount) {
    debugError(
      `Recording callback matched no call session (${JSON.stringify(selector)})`,
    );
  }
};
