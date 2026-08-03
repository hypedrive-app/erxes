import { IconCalendarOff, IconExternalLink } from '@tabler/icons-react';
import { Badge, Skeleton } from 'erxes-ui';
import { format } from 'date-fns';
import { useState } from 'react';

import { BookingDetailSheet } from '~/modules/bookings/components/BookingDetailSheet';
import { getStatusVariant } from '~/modules/bookings/constants/bookingStatus';
import { useCalcomBookings } from '~/modules/bookings/hooks/useCalcomBookings';
import { ICalcomBooking } from '~/modules/bookings/types/booking';

const BookingRow = ({
  booking,
  onOpen,
}: {
  booking: ICalcomBooking;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex flex-col gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent"
  >
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-sm font-medium">
        {booking.title || 'Untitled booking'}
      </span>
      <Badge variant={getStatusVariant(booking.status)}>
        {(booking.status || 'unknown').toLowerCase()}
      </Badge>
    </div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        {booking.startTime
          ? format(new Date(booking.startTime), 'MMM dd, yyyy HH:mm')
          : 'No start time'}
      </span>
      {booking.meetingUrl && (
        <IconExternalLink className="w-3 h-3" aria-label="Has meeting link" />
      )}
    </div>
  </button>
);

/**
 * Cal.com bookings for one CRM contact.
 *
 * Filtered server-side by customerId, which matches on
 * `attendees.erxesCustomerId` — the link the webhook handler resolves when a
 * booking arrives. A contact whose email never matched a customer shows
 * nothing here, which is correct: the booking exists, but it is not this
 * person's as far as the CRM can prove.
 */
export const CustomerBookingsWidget = ({
  customerId,
}: {
  customerId: string;
}) => {
  const [openBookingId, setOpenBookingId] = useState<string>();

  const { bookings, totalCount, loading, hasMore, handleFetchMore } =
    useCalcomBookings({
      customerId,
      // A contact panel is a summary surface, not a browser — a short page
      // keeps the widget from dominating the detail view.
      perPage: 5,
      skip: !customerId,
    });

  if (loading && !bookings.length) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!bookings.length) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <IconCalendarOff size={28} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No Cal.com bookings for this contact.
        </p>
      </div>
    );
  }

  return (
    <>
      <BookingDetailSheet
        bookingId={openBookingId}
        open={!!openBookingId}
        onOpenChange={(next) => !next && setOpenBookingId(undefined)}
      />

      <div className="flex flex-col gap-2 p-3">
        {bookings.map((booking) => (
          <BookingRow
            key={booking._id}
            booking={booking}
            onOpen={() => setOpenBookingId(booking._id)}
          />
        ))}

        {hasMore && (
          <button
            type="button"
            onClick={handleFetchMore}
            className="py-2 text-xs font-medium text-primary hover:underline"
          >
            Show more ({bookings.length} of {totalCount})
          </button>
        )}
      </div>
    </>
  );
};
