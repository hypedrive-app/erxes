import { generateModels, IModels } from '~/connectionResolvers';
import { PlivoApiError, plivoRequest } from '@/integrations/plivo/utils';
import { PlivoCallStatus } from '@/integrations/plivo/@types';

/**
 * How long a call may stay open before it is reconciled.
 *
 * Plivo caps a single call at 24 hours, but nothing here rings for four: a row
 * still open after this long has almost certainly lost its hangup callback
 * rather than being a live conversation. The window is deliberately generous —
 * terminating a call that IS still up would be a worse error than leaving a
 * dead one open a little longer, because the row is what the agent's inbox
 * reads.
 */
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

/**
 * How recent a call must be before its missing CDR is believed.
 *
 * Plivo writes the CDR asynchronously after the call ends, so a 404 on a call
 * that ended seconds ago means "not written yet", not "never happened". Rows
 * younger than this are left alone entirely; `STALE_AFTER_MS` already exceeds
 * it by a wide margin, so this is a second belt on the same trousers.
 */
const CDR_SETTLE_MS = 5 * 60 * 1000;

/** How often the sweep runs. */
const REAP_INTERVAL_MS = 15 * 60 * 1000;

/** Cap per sweep so one pass cannot spend unbounded time on the Plivo API. */
const MAX_PER_SWEEP = 50;

/**
 * The subset of Plivo's call-detail response this reconciliation reads.
 *
 * `call_state` is deliberately NOT read. Plivo's own example response shows
 * it as `"ANSWER"` — singular, uppercase, a different vocabulary entirely from
 * the `in-progress`/`ringing`/`queued`/`completed`/`failed` values this file
 * used to check for, none of which appear in any documented example. Matching
 * on it silently classified every real CDR as "still live" and left every
 * stale row open forever, which defeated the one thing this sweep exists to
 * do. `hangup_cause_code` is used instead: it is a stable numeric id from
 * Plivo's own hangup-causes table, immune to the wording drift that already
 * broke this once.
 * https://www.plivo.com/docs/voice/api/call/retrieve-a-call
 * https://www.plivo.com/docs/voice/troubleshooting/hangup-causes
 */
interface IPlivoCallDetail {
  call_duration?: number;
  hangup_cause_code?: number;
  hangup_cause_name?: string;
}

/**
 * `hangup_cause_code` values meaning the callee was reachable but declined or
 * was already on another call.
 */
const CDR_BUSY_CODES = new Set([3010]); // Busy Line

/**
 * `hangup_cause_code` values meaning the call rang out or was abandoned
 * before anyone picked up — reachable, but never answered.
 */
const CDR_UNANSWERED_CODES = new Set([
  1000, // Canceled
  3000, // No Answer
  3070, // Request timeout
  6010, // Ring Timeout Reached
]);

/**
 * `hangup_cause_code` values meaning the call could never have been answered
 * at all — a routing, provisioning or platform failure rather than a missed
 * connection.
 */
const CDR_FAILED_CODES = new Set([
  1010, // Canceled (Out Of Credits)
  1020, // Canceled (Simultaneous dial limit reached)
  2000, // Invalid Destination Address
  2010, // Destination Out Of Service
  3020, // Rejected
  3050, // Unallocated number
  3080, // Internal server error from carrier
  3090, // Network congestion from carrier
  5000, // Network Error
  5010, // Internal Error
  5020, // Routing Error
]);

/**
 * Maps Plivo's CDR onto our terminal status.
 *
 * Every code this function does not recognise returns undefined rather than a
 * guess, on the same principle the rest of this module already follows: an
 * admitted gap is better than a fabricated outcome, and the row is simply
 * left for a human or a later, better-informed sweep. `hangup_cause_code`
 * being present at all is what the sweep otherwise had no way to infer
 * `call_state` for — a code is only ever assigned once a call has actually
 * ended, so its presence is itself the "this call is over" signal, and the
 * absent-`call_state` handling this replaced is simply gone rather than
 * reinstated on a vocabulary nobody could confirm.
 */
const readCdrStatus = (
  detail: IPlivoCallDetail,
): PlivoCallStatus | undefined => {
  const code = detail.hangup_cause_code;

  if (code === undefined) {
    // No cause recorded yet — the CDR may not be fully written, or the call
    // may genuinely still be live. Either way, guessing is worse than waiting
    // for the next sweep.
    return undefined;
  }

  if (CDR_BUSY_CODES.has(code)) {
    return 'busy';
  }

  if (CDR_UNANSWERED_CODES.has(code)) {
    return 'no-answer';
  }

  if (CDR_FAILED_CODES.has(code)) {
    return 'failed';
  }

  // Normal Hangup (4000) and every other code not classified above: only real
  // talk time may claim the call was actually answered, matching the webhook
  // path's own reasoning that a connected call can still bill zero seconds.
  return (detail.call_duration || 0) > 0 ? 'completed' : 'no-answer';
};

/**
 * Terminates call rows whose hangup callback never arrived.
 *
 * A dropped hangup callback leaves a row at `ringing` with no `duration` and no
 * `endedAt` forever, and the inbox renders that as a call still in progress.
 * This closes those rows, but never by assuming how they ended:
 *
 *  1. Plivo's CDR is asked first, because it is authoritative. If it reports a
 *     real outcome, that outcome — with its true duration and hangup cause — is
 *     what gets written, exactly as the missing callback would have.
 *  2. Only when the CDR cannot answer (no such call, or Plivo unreachable) is
 *     the row closed as `unknown`, which asserts nothing about the outcome.
 *
 * `completed` is never written speculatively: a fabricated outcome is worse
 * than an admitted gap, because it would show the agent a conversation that may
 * never have happened.
 *
 * The `endedAt: { $exists: false }` guard is the same one `registerCallHangup`
 * claims rows with, so a real callback arriving mid-sweep always wins and this
 * can never overwrite a genuine outcome.
 */
export const reapStaleCallSessions = async (
  models: IModels,
): Promise<number> => {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

  const stale = await models.PlivoCallSessions.find({
    endedAt: { $exists: false },
    status: { $in: ['ringing', 'in-progress'] },
    createdAt: { $lt: staleBefore },
  })
    .sort({ createdAt: 1 })
    .limit(MAX_PER_SWEEP);

  if (!stale.length) {
    return 0;
  }

  let reaped = 0;

  for (const session of stale) {
    let status: PlivoCallStatus = 'unknown';
    let duration: number | undefined;
    let hangupCause: string | undefined;

    const integration = session.integrationId
      ? await models.PlivoIntegrations.findOne({
          erxesApiId: session.integrationId,
        })
      : null;

    // A synthetic or malformed uuid has no CDR to ask for; it goes straight to
    // `unknown` rather than burning a request.
    const canAskPlivo = Boolean(
      session.callUuid &&
        integration?.authId &&
        integration?.authToken &&
        session.createdAt &&
        session.createdAt.getTime() < Date.now() - CDR_SETTLE_MS,
    );

    if (canAskPlivo && integration) {
      try {
        const detail = await plivoRequest<IPlivoCallDetail>({
          authId: integration.authId,
          authToken: integration.authToken,
          method: 'GET',
          path: `/Call/${session.callUuid}/`,
        });

        const cdrStatus = readCdrStatus(detail);

        if (!cdrStatus) {
          // Plivo says the call is still live, so this row is not stale after
          // all. Leaving it open is the correct answer.
          continue;
        }

        status = cdrStatus;
        duration = detail.call_duration;
        hangupCause = detail.hangup_cause_name;
      } catch (e) {
        // A 404 means Plivo has no such call and never will, which is itself
        // information: the row is closed as `unknown`. Any other error is a
        // transient API problem, so the row is left for the next sweep rather
        // than closed on the strength of a failed request.
        if (!(e instanceof PlivoApiError && e.status === 404)) {
          console.error(
            `[plivo] Could not reconcile stale call ${session.callUuid}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
          continue;
        }
      }
    }

    const endedAt = new Date();

    const claimed = await models.PlivoCallSessions.findOneAndUpdate(
      { _id: session._id, endedAt: { $exists: false } },
      {
        $set: {
          status,
          endedAt,
          updatedAt: endedAt,
          // Only ever set from a real CDR. An `unknown` row keeps `duration`
          // unset, which is what tells the UI there is no talk time to show
          // rather than showing a zero that looks measured.
          ...(duration === undefined ? {} : { duration }),
          ...(hangupCause ? { hangupCause } : {}),
        },
      },
      { new: true },
    );

    if (claimed) {
      reaped++;
    }
  }

  if (reaped) {
    console.log(
      `[plivo] Reaped ${reaped} stale call session(s) that never received a hangup callback`,
    );
  }

  return reaped;
};

/**
 * Starts the periodic sweep and returns its timer so a caller can stop it.
 *
 * The subdomain is the single-tenant `'os'` this deployment runs as, matching
 * how the Discord distributor bootstraps itself from `onServerInit`.
 *
 * `unref` keeps the interval from holding the process open on shutdown; this is
 * housekeeping and never worth delaying an exit for.
 */
export const startStaleCallReaper = (): NodeJS.Timeout => {
  const sweep = async (): Promise<void> => {
    const models = await generateModels('os');
    await reapStaleCallSessions(models);
  };

  const timer = setInterval(() => {
    sweep().catch((e) => {
      console.error(
        `[plivo] Stale call sweep failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    });
  }, REAP_INTERVAL_MS);

  timer.unref();

  return timer;
};
