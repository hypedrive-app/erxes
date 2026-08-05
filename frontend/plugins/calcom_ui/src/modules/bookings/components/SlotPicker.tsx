import {
  IconAlertTriangle,
  IconCalendarOff,
  IconRefresh,
} from '@tabler/icons-react';
import { Button, Skeleton, cn } from 'erxes-ui';
import { endOfDay, format, startOfDay } from 'date-fns';
import { useMemo } from 'react';

import { useCalcomSlots } from '~/modules/bookings/hooks/useCalcomScheduling';

/**
 * The browser's own zone, sent to Cal.com so returned slots are anchored the
 * way the person reading them expects. Cal.com requires a zone and would
 * otherwise pick one for us.
 */
const localTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * Picks a free slot for an event type on a given day.
 *
 * Slots are read live and never cached — someone else can take one at any
 * moment — so this also offers an explicit refresh rather than pretending the
 * list stays true while the dialog is open.
 */
export const SlotPicker = ({
  eventTypeId,
  day,
  value,
  onChange,
  disabled,
}: {
  eventTypeId?: number;
  day: Date;
  value?: string;
  onChange: (slotStart: string) => void;
  disabled?: boolean;
}) => {
  const timeZone = useMemo(localTimeZone, []);

  // Bounded to the selected day. Asking for a wider window would return slots
  // the user cannot see on this screen and make the response needlessly large.
  const { start, end } = useMemo(
    () => ({
      start: startOfDay(day).toISOString(),
      end: endOfDay(day).toISOString(),
    }),
    [day],
  );

  const { slots, loading, error, refetch } = useCalcomSlots({
    eventTypeId,
    start,
    end,
    timeZone,
    skip: disabled,
  });

  if (!eventTypeId) {
    return (
      <p className="text-sm text-muted-foreground">
        Choose an event type to see available times.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  // Separated from the empty state on purpose. A failed slots call also
  // yields zero slots, and "no free times" plus a Refresh button reads as a
  // real, full calendar — sending someone to try another day when nothing
  // they pick will work until the Cal.com connection is fixed.
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-6 text-center">
        <IconAlertTriangle size={24} className="text-destructive" />
        <p className="text-sm text-muted-foreground">
          Could not load times — {error.message}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
        >
          <IconRefresh className="w-4 h-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (!slots.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-6 text-center">
        <IconCalendarOff size={24} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No free times on {format(day, 'MMM dd')}.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
        >
          <IconRefresh className="w-4 h-4" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
        {slots.map((slot) => {
          const selected = slot.start === value;

          return (
            <Button
              key={slot.start}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'secondary'}
              // aria-pressed rather than relying on colour alone: this is a
              // toggle-style choice and the selected state must be announced.
              aria-pressed={selected}
              onClick={() => onChange(slot.start)}
              className={cn(selected && 'ring-2 ring-primary ring-offset-1')}
            >
              {format(new Date(slot.start), 'HH:mm')}
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Times shown in {timeZone}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
        >
          <IconRefresh className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>
    </div>
  );
};
