import { useApolloClient, useMutation } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useCallback, useState } from 'react';

import {
  CALCOM_CANCEL_BOOKING,
  CALCOM_CONFIRM_BOOKING,
  CALCOM_CREATE_BOOKING,
  CALCOM_DECLINE_BOOKING,
  CALCOM_MARK_NO_SHOW,
  CALCOM_REASSIGN_BOOKING,
  CALCOM_RESCHEDULE_BOOKING,
  CALCOM_UPDATE_BOOKING_LOCATION,
} from '~/modules/bookings/graphql/mutations/bookings';
import {
  CALCOM_BOOKINGS_QUERY,
  CALCOM_BOOKING_QUERY,
} from '~/modules/bookings/graphql/queries/bookings';

/**
 * How long to wait before refetching after a write.
 *
 * These mutations return when Cal.com ACCEPTS the change, but the mirror is
 * updated by the webhook Cal.com sends afterwards. Refetching immediately would
 * re-read the row in its pre-change state and the UI would look like nothing
 * happened. This delay lets the delivery land.
 *
 * It is a heuristic, not a guarantee — hence the second, later refetch. If the
 * webhook is slower than both, the row corrects itself the next time anyone
 * looks at it, because the list query runs cache-and-network.
 */
const WEBHOOK_SETTLE_MS = 1200;
const WEBHOOK_SETTLE_RETRY_MS = 4000;

const REFETCH = [CALCOM_BOOKINGS_QUERY, CALCOM_BOOKING_QUERY];

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

/**
 * Booking writes.
 *
 * Every action goes to Cal.com and comes back through the webhook. Nothing here
 * writes to the Apollo cache optimistically: an optimistic update would assert
 * a state Cal.com has not confirmed, and if Cal.com rejected the change the UI
 * would have shown a cancellation that never happened.
 */
export const useCalcomBookingActions = () => {
  const client = useApolloClient();
  const [pending, setPending] = useState(false);

  const [cancelBookingMutation] = useMutation(CALCOM_CANCEL_BOOKING);
  const [rescheduleBookingMutation] = useMutation(CALCOM_RESCHEDULE_BOOKING);
  const [markNoShowMutation] = useMutation(CALCOM_MARK_NO_SHOW);
  const [createBookingMutation] = useMutation(CALCOM_CREATE_BOOKING);
  const [confirmBookingMutation] = useMutation(CALCOM_CONFIRM_BOOKING);
  const [declineBookingMutation] = useMutation(CALCOM_DECLINE_BOOKING);
  const [updateLocationMutation] = useMutation(CALCOM_UPDATE_BOOKING_LOCATION);
  const [reassignBookingMutation] = useMutation(CALCOM_REASSIGN_BOOKING);

  // Scheduled rather than awaited: the caller should not be blocked for seconds
  // on a delay whose only purpose is to outlast the webhook round trip.
  const scheduleRefetch = useCallback(() => {
    const refetch = () => client.refetchQueries({ include: REFETCH });

    setTimeout(refetch, WEBHOOK_SETTLE_MS);
    setTimeout(refetch, WEBHOOK_SETTLE_RETRY_MS);
  }, [client]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setPending(true);

      try {
        await action();

        toast({ title: success });
        scheduleRefetch();

        return true;
      } catch (e) {
        // Surfaced rather than swallowed: these failures come from Cal.com
        // ("booking already cancelled", "slot no longer available") and the
        // message is the only thing telling the user what to do next.
        toast({
          title: 'Cal.com rejected the change',
          description: errorMessage(e),
          variant: 'destructive',
        });

        return false;
      } finally {
        setPending(false);
      }
    },
    [scheduleRefetch],
  );

  const cancelBooking = useCallback(
    (uid: string, cancellationReason?: string) =>
      run(
        () =>
          cancelBookingMutation({
            variables: { uid, cancellationReason },
          }),
        'Booking cancelled in Cal.com',
      ),
    [run, cancelBookingMutation],
  );

  const rescheduleBooking = useCallback(
    (uid: string, start: string, reschedulingReason?: string) =>
      run(
        () =>
          rescheduleBookingMutation({
            variables: { uid, start, reschedulingReason },
          }),
        'Booking rescheduled',
      ),
    [run, rescheduleBookingMutation],
  );

  const markNoShow = useCallback(
    (
      uid: string,
      input: {
        noShowHost?: boolean;
        attendees?: { email: string; absent: boolean }[];
      },
    ) =>
      run(
        () =>
          markNoShowMutation({
            variables: {
              uid,
              noShowHost: input.noShowHost,
              attendees: input.attendees,
            },
          }),
        'Attendance updated',
      ),
    [run, markNoShowMutation],
  );

  const createBooking = useCallback(
    (input: {
      eventTypeId: number;
      start: string;
      attendee: { name: string; email: string; timeZone?: string };
      customerId?: string;
    }) =>
      run(
        () => createBookingMutation({ variables: input }),
        'Booking created in Cal.com',
      ),
    [run, createBookingMutation],
  );

  const confirmBooking = useCallback(
    (uid: string) =>
      run(
        () => confirmBookingMutation({ variables: { uid } }),
        'Booking confirmed',
      ),
    [run, confirmBookingMutation],
  );

  const declineBooking = useCallback(
    (uid: string, reason?: string) =>
      run(
        () => declineBookingMutation({ variables: { uid, reason } }),
        'Booking declined',
      ),
    [run, declineBookingMutation],
  );

  /**
   * Changes WHERE the meeting happens without moving it in time.
   *
   * Not a reschedule: a reschedule cancels the booking and issues a new uid,
   * which is the wrong outcome for "we'll do this by phone instead".
   */
  const updateBookingLocation = useCallback(
    (uid: string, location: Record<string, unknown>) =>
      run(
        () => updateLocationMutation({ variables: { uid, location } }),
        'Meeting location updated',
      ),
    [run, updateLocationMutation],
  );

  /**
   * Reassigns a round-robin booking. Deliberately has no UI surface — it only
   * applies to team round-robin event types and is an ops/dispatcher action
   * rather than a rep-facing one, so it is exposed for automations and admin
   * tooling instead of adding a button most users could never use.
   */
  const reassignBooking = useCallback(
    (uid: string, userId?: number, reason?: string) =>
      run(
        () => reassignBookingMutation({ variables: { uid, userId, reason } }),
        'Booking reassigned',
      ),
    [run, reassignBookingMutation],
  );

  return {
    pending,
    cancelBooking,
    rescheduleBooking,
    markNoShow,
    createBooking,
    confirmBooking,
    declineBooking,
    updateBookingLocation,
    reassignBooking,
  };
};
