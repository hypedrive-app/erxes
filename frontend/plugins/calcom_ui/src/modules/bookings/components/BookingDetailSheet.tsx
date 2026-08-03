import {
  IconCalendarX,
  IconExternalLink,
  IconUserX,
} from '@tabler/icons-react';
import { Badge, Button, Sheet, Skeleton } from 'erxes-ui';
import { format } from 'date-fns';
import { useState } from 'react';

import { CancelBookingDialog } from '~/modules/bookings/components/CancelBookingDialog';
import { RescheduleBookingDialog } from '~/modules/bookings/components/RescheduleBookingDialog';
import { getStatusVariant } from '~/modules/bookings/constants/bookingStatus';
import { useCalcomBooking } from '~/modules/bookings/hooks/useCalcomBooking';
import { useCalcomBookingActions } from '~/modules/bookings/hooks/useCalcomBookingActions';

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <div className="text-sm">{children}</div>
  </div>
);

const formatMoment = (value?: string) =>
  value ? format(new Date(value), 'MMM dd, yyyy HH:mm') : '—';

export const BookingDetailSheet = ({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { booking, loading } = useCalcomBooking({ _id: bookingId });
  const { markNoShow, pending } = useCalcomBookingActions();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Cal.com rejects changes to a booking that is already cancelled or rejected,
  // so the actions are hidden rather than offered and then failed. An action
  // the user cannot take should not be a button they can press.
  const isTerminal =
    booking?.status === 'CANCELLED' || booking?.status === 'REJECTED';

  // No-show only makes sense once the meeting was supposed to have happened;
  // before that there is nothing to report.
  const hasStarted = booking?.startTime
    ? new Date(booking.startTime) <= new Date()
    : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.View className="p-0 sm:max-w-lg">
        <Sheet.Header>
          <Sheet.Title>{booking?.title || 'Booking'}</Sheet.Title>
          <Sheet.Close />
        </Sheet.Header>

        <Sheet.Content className="p-5 flex flex-col gap-5 overflow-y-auto">
          {loading && !booking && (
            <div className="flex flex-col gap-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          )}

          {!loading && !booking && (
            <p className="text-sm text-muted-foreground">
              This booking is no longer in the mirror.
            </p>
          )}

          {booking && (
            <>
              <Field label="Status">
                <Badge variant={getStatusVariant(booking.status)}>
                  {(booking.status || 'unknown').toLowerCase()}
                </Badge>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Starts">{formatMoment(booking.startTime)}</Field>
                <Field label="Ends">{formatMoment(booking.endTime)}</Field>
              </div>

              <Field label="Event type">{booking.eventTypeSlug || '—'}</Field>

              <Field label="Organizer">
                {booking.organizerName || booking.organizerEmail || '—'}
              </Field>

              <Field label="Attendees">
                {booking.attendees?.length ? (
                  <ul className="flex flex-col gap-1">
                    {booking.attendees.map((attendee, index) => (
                      // Index in the key because an attendee has no id of its
                      // own and Cal.com allows the same email twice on one
                      // booking; email alone would collide.
                      <li
                        key={`${attendee.email ?? 'anon'}-${index}`}
                        className="flex flex-col"
                      >
                        <span>{attendee.name || attendee.email || '—'}</span>
                        {attendee.name && attendee.email && (
                          <span className="text-xs text-muted-foreground">
                            {attendee.email}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  '—'
                )}
              </Field>

              {booking.description && (
                <Field label="Description">
                  <p className="whitespace-pre-wrap">{booking.description}</p>
                </Field>
              )}

              <Field label="Location">
                {booking.meetingUrl ? (
                  <a
                    href={booking.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Join meeting
                    <IconExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  booking.location || '—'
                )}
              </Field>

              {/* Cancellation details only exist on a cancelled booking, so the
                  whole block is conditional rather than rendering empty rows. */}
              {booking.cancellationReason || booking.cancelledBy ? (
                <div className="flex flex-col gap-4 rounded-md border border-destructive/20 bg-destructive/5 p-4">
                  {booking.cancelledBy && (
                    <Field label="Cancelled by">{booking.cancelledBy}</Field>
                  )}
                  {booking.cancellationReason && (
                    <Field label="Reason">{booking.cancellationReason}</Field>
                  )}
                </div>
              ) : null}

              {booking.rescheduledFromUid && (
                <Field label="Rescheduled from">
                  {booking.rescheduledFromUid}
                </Field>
              )}

              {booking.paymentStatus && (
                <Field label="Payment">{booking.paymentStatus}</Field>
              )}

              {/* Explicit undefined check: `false` means Cal.com told us the
                  host did show up, which is different from never reporting. */}
              {booking.noShowHost !== undefined && (
                <Field label="Host no-show">
                  {booking.noShowHost ? 'Yes' : 'No'}
                </Field>
              )}

              <Field label="Cal.com reference">
                <code className="text-xs">{booking.uid || '—'}</code>
              </Field>

              <Field label="Last synced">
                {formatMoment(booking.lastPayloadAt)}
                {booking.lastTriggerEvent && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({booking.lastTriggerEvent})
                  </span>
                )}
              </Field>
            </>
          )}
        </Sheet.Content>

        {/* Actions live in a footer rather than beside each field: they act on
            the booking as a whole, and keeping them in one place means the
            destructive one is never adjacent to something harmless. */}
        {booking && !isTerminal && (
          <Sheet.Footer className="border-t shrink-0">
            {hasStarted && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  booking.uid && markNoShow(booking.uid, { noShowHost: true })
                }
              >
                <IconUserX className="w-4 h-4" />
                Host no-show
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => setRescheduleOpen(true)}
            >
              Reschedule
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setCancelOpen(true)}
            >
              <IconCalendarX className="w-4 h-4" />
              Cancel
            </Button>
          </Sheet.Footer>
        )}
      </Sheet.View>

      <CancelBookingDialog
        uid={booking?.uid}
        title={booking?.title}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />

      <RescheduleBookingDialog
        uid={booking?.uid}
        eventTypeId={booking?.eventTypeId}
        title={booking?.title}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />
    </Sheet>
  );
};
