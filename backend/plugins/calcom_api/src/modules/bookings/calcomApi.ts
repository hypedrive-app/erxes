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

const apiUrl = () =>
  process.env.CALCOM_API_URL?.replace(/\/+$/, '') ||
  'https://cal.sharksmarketing.com/api/v2';

export class CalcomApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'CalcomApiError';
  }
}

const request = async (
  path: string,
  init: { method: string; body?: unknown; query?: Record<string, unknown> },
): Promise<any> => {
  const key = process.env.CALCOM_API_KEY;

  if (!key) {
    // Explicit rather than letting Cal.com answer 401: an unset key is a
    // deployment mistake, and saying so is more useful than an auth error.
    throw new CalcomApiError('CALCOM_API_KEY is not configured');
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

  const res = await fetch(`${apiUrl()}${path}${qs ? `?${qs}` : ''}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Cal.com v2 endpoints are versioned by date; without this header the
      // API answers with whatever it considers current, which can change
      // underneath a working integration.
      'cal-api-version': '2024-08-13',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

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
  uid: string,
  cancellationReason?: string,
): Promise<any> =>
  request(`/bookings/${encodeURIComponent(uid)}/cancel`, {
    method: 'POST',
    body: { cancellationReason: cancellationReason || 'Cancelled by erxes' },
  });

/**
 * Reschedules a booking. Cal.com issues a NEW uid for the result and marks the
 * original CANCELLED, then sends BOOKING_RESCHEDULED — so the mirror is updated
 * by the webhook, not by this response.
 */
export const rescheduleCalcomBooking = async (
  uid: string,
  start: string,
  reschedulingReason?: string,
): Promise<any> =>
  request(`/bookings/${encodeURIComponent(uid)}/reschedule`, {
    method: 'POST',
    body: {
      start,
      reschedulingReason: reschedulingReason || 'Rescheduled from erxes',
    },
  });

/** Marks a host or attendee as absent, which drives the no-show trigger. */
export const markCalcomNoShow = async (
  uid: string,
  input: { noShowHost?: boolean; attendees?: { email: string; absent: boolean }[] },
): Promise<any> =>
  request(`/bookings/${encodeURIComponent(uid)}/mark-absent`, {
    method: 'POST',
    body: input,
  });

/**
 * The bookable event types. Webhooks only ever name the event type of a booking
 * that already happened, so this is the only way to offer a choice of what to
 * book from inside erxes.
 */
export const listCalcomEventTypes = async (username?: string): Promise<any> =>
  request('/event-types', { method: 'GET', query: { username } });

/**
 * Free slots for an event type in a date range. Availability is computed by
 * Cal.com against calendars erxes cannot see, so it must be asked rather than
 * derived from the mirror.
 */
export const getCalcomSlots = async (params: {
  eventTypeId: number;
  start: string;
  end: string;
  timeZone?: string;
}): Promise<any> =>
  request('/slots', {
    method: 'GET',
    query: {
      eventTypeId: params.eventTypeId,
      start: params.start,
      end: params.end,
      timeZone: params.timeZone,
    },
  });

/**
 * Creates a booking. Used by the "book a time" flow in the customer panel; the
 * resulting BOOKING_CREATED webhook is what writes it into the mirror, so this
 * deliberately does not insert a row itself — one write path, not two.
 */
export const createCalcomBooking = async (input: {
  eventTypeId: number;
  start: string;
  attendee: { name: string; email: string; timeZone: string };
  metadata?: Record<string, string>;
}): Promise<any> => request('/bookings', { method: 'POST', body: input });

/** Reads a single booking, for reconciling a uid the mirror may have missed. */
export const getCalcomBooking = async (uid: string): Promise<any> =>
  request(`/bookings/${encodeURIComponent(uid)}`, { method: 'GET' });

/**
 * Lists bookings, used by the backfill/reconciliation path: webhooks can be
 * missed (endpoint down, delivery disabled), and without a way to re-read them
 * the mirror would stay permanently short with no way to notice.
 */
export const listCalcomBookings = async (params: {
  afterStart?: string;
  beforeEnd?: string;
  status?: string;
  take?: number;
  skip?: number;
}): Promise<any> => request('/bookings', { method: 'GET', query: params });
