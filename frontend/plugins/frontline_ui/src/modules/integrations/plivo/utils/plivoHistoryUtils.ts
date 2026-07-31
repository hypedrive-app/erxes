import { REACT_APP_API_URL, formatPhoneNumber } from 'erxes-ui';
import {
  IPlivoCallHistory,
  PlivoCallOutcome,
} from '@/integrations/plivo/types/plivoTypes';

/**
 * Turns a stored recording reference into something `<audio>` can load.
 *
 * After re-hosting, `recordUrl` holds an erxes STORAGE KEY, not a URL — feeding
 * that to the player directly resolves against the app origin and 404s. A value
 * that is already absolute (`http…`) or root-relative (`/…`) is passed through
 * untouched, which is what keeps a row still pointing at Plivo's own copy
 * playable after a failed re-host.
 *
 * Mirrors `getRecordingUrl` in the Grandstream call module so both providers
 * read audio the same way.
 */
export const getPlivoRecordingUrl = (value: string): string => {
  if (value.startsWith('http') || value.startsWith('/')) {
    return value;
  }

  return `${REACT_APP_API_URL}/read-file?key=${encodeURIComponent(value)}`;
};

/**
 * Collapses direction, status and the voicemail flag into ONE outcome.
 *
 * Voicemail is checked FIRST and on purpose. A voicemail row also carries a
 * not-answered status, so testing status first would file every voicemail
 * under "missed" and lose the fact that someone left a message waiting — the
 * exact distinction this history is being built to surface.
 */
export const getPlivoCallOutcome = (
  callHistory: Pick<IPlivoCallHistory, 'status' | 'isVoicemail' | 'duration'>,
): PlivoCallOutcome => {
  if (callHistory.isVoicemail) {
    return 'voicemail';
  }

  switch (callHistory.status) {
    case 'busy':
      return 'busy';
    case 'failed':
      return 'failed';
    case 'no-answer':
      return 'missed';
    case 'ringing':
    case 'in-progress':
      return 'in-progress';
    case 'completed':
      // Plivo reports an unanswered call as `completed` too; a call that never
      // carried audio was never really answered, so zero seconds reads as
      // missed rather than as a successful zero-length conversation.
      return callHistory.duration ? 'answered' : 'missed';
    default:
      return 'missed';
  }
};

/** Outcomes that mean nobody spoke to the caller. */
export const PLIVO_UNANSWERED_OUTCOMES: PlivoCallOutcome[] = [
  'voicemail',
  'missed',
  'busy',
  'failed',
];

/** i18n keys for each outcome, so the badge never renders a raw enum value. */
export const PLIVO_CALL_OUTCOME_LABEL_KEYS: Record<PlivoCallOutcome, string> = {
  answered: 'plivo-call-answered',
  voicemail: 'plivo-call-voicemail',
  missed: 'plivo-call-missed',
  busy: 'plivo-call-busy',
  failed: 'plivo-call-failed-status',
  'in-progress': 'plivo-call-in-progress',
};

/**
 * Who the call was with.
 *
 * Prefers the resolved contact's name, because a name is what an agent
 * recognises. Falls back to the formatted number rather than to a placeholder:
 * an unmatched call is still perfectly identifiable by its number, and showing
 * "Unknown" would throw away the one thing that is actually known.
 */
export const getPlivoCounterpartLabel = (
  callHistory: Pick<IPlivoCallHistory, 'customer' | 'counterpartNumber'>,
): string => {
  const { customer, counterpartNumber } = callHistory;

  const name = [customer?.firstName, customer?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (name) {
    return name;
  }

  if (counterpartNumber) {
    return formatPhoneNumber({ value: counterpartNumber });
  }

  return customer?.primaryPhone
    ? formatPhoneNumber({ value: customer.primaryPhone })
    : '';
};

/**
 * Seconds as `m:ss`, or `h:mm:ss` once a call runs past the hour.
 *
 * Call history is scanned, not read — a leading `00:` on every row is noise, so
 * unlike the in-call timer this drops the hour segment when there isn't one.
 */
export const formatPlivoDuration = (seconds?: number | null): string => {
  if (!seconds || seconds < 0) {
    return '0:00';
  }

  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(
      2,
      '0',
    )}`;
  }

  return `${mins}:${String(secs).padStart(2, '0')}`;
};
