import { useQuery } from '@apollo/client';

import { CALCOM_BOOKING_QUERY } from '~/modules/bookings/graphql/queries/bookings';
import { ICalcomBooking } from '~/modules/bookings/types/booking';

/**
 * Reads one booking, by mirror id or by Cal.com uid.
 *
 * Both lookups exist because the two callers hold different identifiers: the
 * list links by _id, while anything arriving from Cal.com's side (a webhook
 * URL, a support ticket quoting the booking reference) only ever has the uid.
 */
export const useCalcomBooking = ({
  _id,
  uid,
}: {
  _id?: string;
  uid?: string;
}) => {
  const { data, loading, error } = useQuery<{
    calcomBooking: ICalcomBooking | null;
  }>(CALCOM_BOOKING_QUERY, {
    variables: { _id, uid },
    // Neither identifier means there is nothing to ask for; without this the
    // query fires with both null and the resolver answers null, which the UI
    // would render as "not found" rather than "nothing requested".
    skip: !_id && !uid,
  });

  return {
    booking: data?.calcomBooking ?? null,
    loading,
    error,
  };
};
