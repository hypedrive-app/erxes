import { IModels } from '~/connectionResolvers';

import { getCalcomConfig } from '@/bookings/config';

/**
 * Cal.com API v2 client.
 *
 * The mirror itself is fed by webhooks, so none of this is on the ingest path.
 * These are the calls that need Cal.com to answer or to act: writing back
 * (cancel, reschedule), and reading the things a webhook never sends — event
 * types and free slots — which the UI needs to offer "book a time" from inside
 * erxes.
 *
 * CALCOM_API_URL points at the v2 API (for the self-hosted instance that is
 * <webapp>/api/v2), CALCOM_API_KEY is an API key from Cal.com's settings.
 */

/**
 * Credentials resolve DB-first with an env fallback (see modules/bookings/
 * config.ts), so every call takes the models it should read them from. Passing
 * `undefined` degrades to environment-only, which is the correct behaviour on
 * paths that run before a subdomain — and therefore a connection — is known.
 */
const apiUrl = async (models?: IModels) =>
  (
    (await getCalcomConfig(models, 'CALCOM_API_URL')) ||
    'https://cal.sharksmarketing.com/api/v2'
  ).replace(/\/+$/, '');

export class CalcomApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'CalcomApiError';
  }
}

/**
 * Cal.com versions each endpoint independently by date, and `cal-api-version`
 * is a REQUIRED parameter — not a nicety. Sending one blanket version for
 * everything is wrong: verified against docs/api-reference/v2/openapi.json in
 * the cal.com fork, /slots expects 2024-09-04 and /event-types expects
 * 2024-06-14, while the booking endpoints expect 2024-08-13. The wrong version
 * does not error, it returns a DIFFERENT response shape, which is the kind of
 * failure that looks like a parsing bug.
 */
const API_VERSION_BOOKINGS = '2024-08-13';
const API_VERSION_SLOTS = '2024-09-04';
const API_VERSION_EVENT_TYPES = '2024-06-14';

/**
 * Exported (not just used locally) so the event-types, schedules and teams
 * clients share one fetch/auth/error-handling path instead of each
 * reimplementing the version-header and non-JSON-response handling above.
 */
export const calcomRequest = async (
  path: string,
  init: {
    method: string;
    body?: unknown;
    query?: Record<string, unknown>;
    apiVersion?: string;
    models?: IModels;
  },
): Promise<any> => {
  const key = await getCalcomConfig(init.models, 'CALCOM_API_KEY');

  if (!key) {
    // Explicit rather than letting Cal.com answer 401: an unset key is a
    // configuration mistake, and saying so is more useful than an auth error.
    throw new CalcomApiError(
      'CALCOM_API_KEY is not configured — set it in Cal.com settings or the deployment environment',
    );
  }

  // Undefined query values are dropped rather than serialised as the string
  // "undefined", which Cal.com would treat as a real filter value.
  const qs = init.query
    ? Object.entries(init.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(
          ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join('&')
    : '';

  const res = await fetch(
    `${await apiUrl(init.models)}${path}${qs ? `?${qs}` : ''}`,
    {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Defaults to the bookings version, since most calls here are
        // bookings. Endpoints on a different track pass their own.
        'cal-api-version': init.apiVersion || API_VERSION_BOOKINGS,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    },
  );

  const text = await res.text();
  let parsed: any;

  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    // Cal.com returns HTML for some error states (a proxy 502, an auth
    // redirect). Surfacing the raw text beats "Unexpected token < in JSON".
    throw new CalcomApiError(
      `Cal.com returned a non-JSON response: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  if (!res.ok) {
    throw new CalcomApiError(
      parsed?.error?.message || parsed?.message || `HTTP ${res.status}`,
      res.status,
    );
  }

  return parsed;
};

/**
 * Cancels a booking by its uid — the same identifier the mirror is keyed on and
 * the one every webhook carries, so an automation can cancel a booking it was
 * triggered by without a second lookup.
 */
export const cancelCalcomBooking = async (
  models: IModels | undefined,
  uid: string,
  cancellationReason?: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/cancel`, {
    method: 'POST',
    body: { cancellationReason: cancellationReason || 'Cancelled by erxes' },
    models,
  });

/**
 * Reschedules a booking. Cal.com issues a NEW uid for the result and marks the
 * original CANCELLED, then sends BOOKING_RESCHEDULED — so the mirror is updated
 * by the webhook, not by this response.
 */
export const rescheduleCalcomBooking = async (
  models: IModels | undefined,
  uid: string,
  start: string,
  reschedulingReason?: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/reschedule`, {
    method: 'POST',
    body: {
      start,
      reschedulingReason: reschedulingReason || 'Rescheduled from erxes',
    },
    models,
  });

/**
 * Confirms a booking that is awaiting approval.
 *
 * Event types with requiresConfirmation create bookings in PENDING and emit
 * BOOKING_REQUESTED. Without this the plugin could mirror those requests but
 * offer no way to act on them, which is the least useful place to stop — a
 * pending booking is precisely the one that needs a decision.
 */
export const confirmCalcomBooking = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/confirm`, {
    method: 'POST',
    models,
  });

/**
 * Declines a booking that is awaiting approval.
 *
 * The reason is optional per DeclineBookingInput_2024_08_13, but Cal.com puts
 * it in the message to the person who asked, so it is worth passing through.
 */
export const declineCalcomBooking = async (
  models: IModels | undefined,
  uid: string,
  reason?: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/decline`, {
    method: 'POST',
    body: reason ? { reason } : {},
    models,
  });

/**
 * Marks a host or attendee as absent, which drives the no-show trigger.
 *
 * The wire field is `host`, NOT `noShowHost` — verified against
 * MarkAbsentBookingInput_2024_08_13 in packages/platform/types and the
 * generated openapi.json. This is worth stating because getting it wrong fails
 * silently: the DTO strips unknown properties, so sending `noShowHost` returns
 * 200 having changed nothing. The webhook payload uses `noShowHost` for the
 * same concept, which is exactly how the confusion arises.
 */
export const markCalcomNoShow = async (
  models: IModels | undefined,
  uid: string,
  input: {
    noShowHost?: boolean;
    attendees?: { email: string; absent: boolean }[];
  },
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/mark-absent`, {
    method: 'POST',
    body: {
      // Renamed at the boundary rather than through the codebase: callers and
      // the mirror both speak the webhook's `noShowHost`, and only this one
      // request needs the API's spelling.
      ...(typeof input.noShowHost === 'boolean'
        ? { host: input.noShowHost }
        : {}),
      ...(input.attendees?.length ? { attendees: input.attendees } : {}),
    },
    models,
  });

/**
 * Cal Video recordings for a finished meeting.
 *
 * Only Cal Video produces these — a Google Meet or Zoom booking answers with an
 * empty list rather than an error, which is why callers get [] instead of a
 * thrown "not supported".
 */
export const getCalcomRecordings = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/recordings`, {
    method: 'GET',
    models,
  });

/** Cal Video transcripts. Same Cal-Video-only caveat as recordings. */
export const getCalcomTranscripts = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/transcripts`, {
    method: 'GET',
    models,
  });

/**
 * "Add to calendar" links (Google, Outlook, Office365, ICS).
 *
 * Cal.com already emails these to the attendee; they exist here for the CRM
 * user, who is usually looking at someone else's booking and has no email to
 * dig through.
 */
export const getCalcomCalendarLinks = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/calendar-links`, {
    method: 'GET',
    models,
  });

/**
 * The booking's calendar/conferencing references — which external calendar
 * event and meeting this booking actually created.
 *
 * Diagnostic rather than routine: when a booking exists in Cal.com but nobody
 * sees it in their calendar, this is what says whether the calendar write
 * succeeded.
 */
export const getCalcomReferences = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/references`, {
    method: 'GET',
    models,
  });

/** Conferencing session metadata for a Cal Video booking. */
export const getCalcomConferencingSessions = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/conferencing-sessions`, {
    method: 'GET',
    models,
  });

/**
 * Reads one seat of a seated booking.
 *
 * Seated event types give each attendee their own seat uid, and that is the
 * only identifier the attendee ever sees — a support conversation quoting a
 * seat reference cannot be resolved through the booking uid.
 */
export const getCalcomBookingBySeat = async (
  models: IModels | undefined,
  seatUid: string,
): Promise<any> =>
  calcomRequest(`/bookings/by-seat/${encodeURIComponent(seatUid)}`, {
    method: 'GET',
    models,
  });

/**
 * Changes where the meeting happens without moving it in time.
 *
 * Distinct from a reschedule, which cancels the booking and issues a new uid.
 * Changing "Google Meet" to "phone call" should not do that.
 *
 * `location` is passed through as an object because the API accepts a union of
 * location shapes (address, attendee-defined, phone, link) and validates it
 * against the event type's configured locations. Narrowing it here to one
 * shape would reject valid inputs the event type allows.
 */
export const updateCalcomBookingLocation = async (
  models: IModels | undefined,
  uid: string,
  location: Record<string, unknown>,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/location`, {
    method: 'PATCH',
    body: { location },
    models,
  });

/**
 * Reassigns a round-robin booking to whoever Cal.com picks next.
 *
 * Only meaningful for team round-robin event types; a fixed-host booking has
 * nobody to reassign to and Cal.com refuses it.
 */
export const reassignCalcomBooking = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}/reassign`, {
    method: 'POST',
    models,
  });

/** Reassigns a booking to a specific team member. */
export const reassignCalcomBookingToUser = async (
  models: IModels | undefined,
  uid: string,
  userId: number,
  reason?: string,
): Promise<any> =>
  calcomRequest(
    `/bookings/${encodeURIComponent(uid)}/reassign/${encodeURIComponent(
      String(userId),
    )}`,
    {
      method: 'POST',
      body: reason ? { reason } : {},
      models,
    },
  );

/**
 * Webhook subscriptions owned by the API key's user.
 *
 * These exist so the plugin can provision and repair its own subscription
 * instead of asking an operator to create one in Cal.com's UI and paste a
 * matching secret into erxes — which was the integration's single largest
 * setup-friction point, and the one step most likely to be done wrong.
 */
export const listCalcomWebhooks = async (
  models: IModels | undefined,
  params: { take?: number; skip?: number } = {},
): Promise<any> =>
  calcomRequest('/webhooks', { method: 'GET', query: params, models });

/**
 * Creates a subscription.
 *
 * `active`, `subscriberUrl` and `triggers` are the required fields per
 * CreateWebhookInputDto; `secret` is optional to Cal.com but never omitted
 * here, because an unsigned webhook is one this plugin will reject.
 */
export const createCalcomWebhook = async (
  models: IModels | undefined,
  input: {
    subscriberUrl: string;
    triggers: string[];
    secret: string;
    active?: boolean;
  },
): Promise<any> =>
  calcomRequest('/webhooks', {
    method: 'POST',
    body: {
      active: input.active ?? true,
      subscriberUrl: input.subscriberUrl,
      triggers: input.triggers,
      secret: input.secret,
    },
    models,
  });

/** Repairs an existing subscription in place — URL, triggers or active flag. */
export const updateCalcomWebhook = async (
  models: IModels | undefined,
  webhookId: string,
  input: {
    subscriberUrl?: string;
    triggers?: string[];
    secret?: string;
    active?: boolean;
  },
): Promise<any> =>
  calcomRequest(`/webhooks/${encodeURIComponent(webhookId)}`, {
    method: 'PATCH',
    body: input,
    models,
  });

export const deleteCalcomWebhook = async (
  models: IModels | undefined,
  webhookId: string,
): Promise<any> =>
  calcomRequest(`/webhooks/${encodeURIComponent(webhookId)}`, {
    method: 'DELETE',
    models,
  });

/**
 * The bookable event types. Webhooks only ever name the event type of a booking
 * that already happened, so this is the only way to offer a choice of what to
 * book from inside erxes.
 */
export const listCalcomEventTypes = async (
  models: IModels | undefined,
  username?: string,
): Promise<any> =>
  calcomRequest('/event-types', {
    method: 'GET',
    query: { username },
    apiVersion: API_VERSION_EVENT_TYPES,
    models,
  });

/**
 * Free slots for an event type in a date range. Availability is computed by
 * Cal.com against calendars erxes cannot see, so it must be asked rather than
 * derived from the mirror.
 */
export const getCalcomSlots = async (
  models: IModels | undefined,
  params: {
    eventTypeId: number;
    start: string;
    end: string;
    timeZone?: string;
    // `format: 'range'` makes each slot carry an `end` as well as a `start`.
    // Without it Cal.com returns start times only, so the GraphQL `end` field
    // is legitimately null — the duration is the event type's, not the slot's.
    format?: 'time' | 'range';
  },
): Promise<any> =>
  calcomRequest('/slots', {
    method: 'GET',
    query: {
      eventTypeId: params.eventTypeId,
      start: params.start,
      end: params.end,
      timeZone: params.timeZone,
      // Asked for explicitly so slots carry both ends, which is what the UI
      // needs to show a time range rather than just a start.
      format: params.format || 'range',
    },
    apiVersion: API_VERSION_SLOTS,
    models,
  });

/**
 * Creates a booking. Used by the "book a time" flow in the customer panel; the
 * resulting BOOKING_CREATED webhook is what writes it into the mirror, so this
 * deliberately does not insert a row itself — one write path, not two.
 */
export const createCalcomBooking = async (
  models: IModels | undefined,
  input: {
    eventTypeId: number;
    start: string;
    attendee: { name: string; email: string; timeZone: string };
    metadata?: Record<string, string>;
  },
): Promise<any> =>
  calcomRequest('/bookings', { method: 'POST', body: input, models });

/** Reads a single booking, for reconciling a uid the mirror may have missed. */
export const getCalcomBooking = async (
  models: IModels | undefined,
  uid: string,
): Promise<any> =>
  calcomRequest(`/bookings/${encodeURIComponent(uid)}`, { method: 'GET', models });

/**
 * Lists bookings, used by the backfill/reconciliation path: webhooks can be
 * missed (endpoint down, delivery disabled), and without a way to re-read them
 * the mirror would stay permanently short with no way to notice.
 */
export const listCalcomBookings = async (
  models: IModels | undefined,
  params: {
    afterStart?: string;
    beforeEnd?: string;
    status?: string;
    take?: number;
    skip?: number;
  },
): Promise<any> =>
  calcomRequest('/bookings', { method: 'GET', query: params, models });
