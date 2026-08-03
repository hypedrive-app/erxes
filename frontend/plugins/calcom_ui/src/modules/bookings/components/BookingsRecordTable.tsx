import { IconCalendarOff } from '@tabler/icons-react';
import { RecordTable } from 'erxes-ui';
import { useMemo, useState } from 'react';

import { BookingDetailSheet } from '~/modules/bookings/components/BookingDetailSheet';
import { getBookingsColumns } from '~/modules/bookings/components/BookingsColumns';
import { useCalcomBookings } from '~/modules/bookings/hooks/useCalcomBookings';

export const BookingsRecordTable = () => {
  const { bookings, loading, hasMore, handleFetchMore } = useCalcomBookings();
  const [openBookingId, setOpenBookingId] = useState<string>();

  // Memoised on the stable setter: rebuilding the column array every render
  // would remount every cell and lose the table's internal state.
  const columns = useMemo(
    () => getBookingsColumns({ onOpenBooking: setOpenBookingId }),
    [],
  );

  return (
    <>
      <BookingDetailSheet
        bookingId={openBookingId}
        open={!!openBookingId}
        // The id is cleared on close so reopening the same row refetches
        // rather than showing a stale sheet.
        onOpenChange={(next) => !next && setOpenBookingId(undefined)}
      />
    <RecordTable.Provider
      columns={columns}
      data={bookings}
      className="m-3"
      stickyColumns={['title']}
    >
      {/*
        No sessionKey. The cursor provider persists the top visible row id to
        sessionStorage to restore scroll, and a stale entry is what makes erxes
        record tables render blank on revisit. This list is page-based and
        cheap to reload from the top, so the persistence is not worth the
        failure mode.

        hasPreviousPage is false because paging only ever moves forward here —
        the first page is always the newest bookings.
      */}
      <RecordTable.CursorProvider
        hasPreviousPage={false}
        hasNextPage={hasMore}
        loading={loading}
        dataLength={bookings.length}
      >
        <RecordTable>
          <RecordTable.Header />
          <RecordTable.Body>
            {loading && !bookings.length && (
              <RecordTable.RowSkeleton rows={20} />
            )}
            <RecordTable.RowList />
            <RecordTable.CursorForwardSkeleton
              handleFetchMore={handleFetchMore}
            />
          </RecordTable.Body>
        </RecordTable>
        {!loading && !bookings.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center justify-center text-center">
              <IconCalendarOff size={48} className="text-muted-foreground" />
              <h3 className="mt-6 text-lg font-semibold">No bookings yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Bookings appear here once Cal.com delivers a webhook for them.
              </p>
            </div>
          </div>
        )}
      </RecordTable.CursorProvider>
      </RecordTable.Provider>
    </>
  );
};
