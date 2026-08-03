import {
  IconCalendarEvent,
  IconClock,
  IconLabel,
  IconLink,
  IconProgressCheck,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { ColumnDef } from '@tanstack/table-core';
import {
  Badge,
  RecordTableInlineCell,
  RelativeDateDisplay,
  TextOverflowTooltip,
} from 'erxes-ui';

import { getStatusVariant } from '~/modules/bookings/constants/bookingStatus';
import { ICalcomBooking } from '~/modules/bookings/types/booking';

const HeaderCell = ({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) => (
  <div className="flex items-center gap-2">
    <Icon className="w-4 h-4 text-accent-foreground" />
    {label}
  </div>
);

/**
 * Columns are produced by a factory rather than exported as a constant so the
 * title cell can reach the detail-sheet opener. RecordTable has no row-click
 * prop — rows are not clickable — so the affordance belongs on a cell, which
 * matches how the accounting tables pass their own callbacks down.
 */
export const getBookingsColumns = ({
  onOpenBooking,
}: {
  onOpenBooking: (bookingId: string) => void;
}): ColumnDef<ICalcomBooking>[] => [
  {
    id: 'title',
    accessorKey: 'title',
    header: () => <HeaderCell icon={IconLabel} label="Title" />,
    cell: ({ cell, row }) => (
      <RecordTableInlineCell>
        <button
          type="button"
          className="truncate text-left hover:underline"
          onClick={() => onOpenBooking(row.original._id)}
        >
          <TextOverflowTooltip
            value={(cell.getValue() as string) || 'Untitled booking'}
          />
        </button>
      </RecordTableInlineCell>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: () => <HeaderCell icon={IconProgressCheck} label="Status" />,
    cell: ({ cell }) => {
      const status = cell.getValue() as string | undefined;

      if (!status) return <RecordTableInlineCell />;

      return (
        <RecordTableInlineCell>
          {/* Lowercased for display only — the raw value stays uppercase so an
              unfamiliar status still shows itself rather than a fallback. */}
          <Badge variant={getStatusVariant(status)}>
            {status.toLowerCase()}
          </Badge>
        </RecordTableInlineCell>
      );
    },
  },
  {
    id: 'startTime',
    accessorKey: 'startTime',
    header: () => <HeaderCell icon={IconCalendarEvent} label="Starts" />,
    cell: ({ cell }) => {
      const value = cell.getValue() as string | undefined;

      if (!value) return <RecordTableInlineCell />;

      return (
        <RecordTableInlineCell>
          <RelativeDateDisplay value={value}>
            <RelativeDateDisplay.Value value={value} />
          </RelativeDateDisplay>
        </RecordTableInlineCell>
      );
    },
  },
  {
    id: 'endTime',
    accessorKey: 'endTime',
    header: () => <HeaderCell icon={IconClock} label="Ends" />,
    cell: ({ cell }) => {
      const value = cell.getValue() as string | undefined;

      if (!value) return <RecordTableInlineCell />;

      return (
        <RecordTableInlineCell>
          <RelativeDateDisplay value={value}>
            <RelativeDateDisplay.Value value={value} />
          </RelativeDateDisplay>
        </RecordTableInlineCell>
      );
    },
  },
  {
    id: 'attendees',
    accessorKey: 'attendees',
    header: () => <HeaderCell icon={IconUsers} label="Attendees" />,
    cell: ({ cell }) => {
      const attendees = (cell.getValue() as ICalcomBooking['attendees']) ?? [];

      // Named by the first attendee with a count for the rest: a booking
      // usually has exactly one, and listing every name would push the more
      // useful columns off screen.
      const [first, ...rest] = attendees;
      const label = first
        ? `${first.name || first.email || 'Unknown'}${
            rest.length ? ` +${rest.length}` : ''
          }`
        : '';

      return (
        <RecordTableInlineCell>
          <TextOverflowTooltip value={label} />
        </RecordTableInlineCell>
      );
    },
  },
  {
    id: 'organizerName',
    accessorKey: 'organizerName',
    header: () => <HeaderCell icon={IconUser} label="Organizer" />,
    cell: ({ cell, row }) => (
      <RecordTableInlineCell>
        <TextOverflowTooltip
          value={
            (cell.getValue() as string) || row.original.organizerEmail || ''
          }
        />
      </RecordTableInlineCell>
    ),
  },
  {
    id: 'eventTypeSlug',
    accessorKey: 'eventTypeSlug',
    header: () => <HeaderCell icon={IconCalendarEvent} label="Event type" />,
    cell: ({ cell }) => (
      <RecordTableInlineCell>
        <TextOverflowTooltip value={(cell.getValue() as string) || ''} />
      </RecordTableInlineCell>
    ),
  },
  {
    id: 'meetingUrl',
    accessorKey: 'meetingUrl',
    header: () => <HeaderCell icon={IconLink} label="Meeting" />,
    cell: ({ cell, row }) => {
      const url = (cell.getValue() as string) || '';
      // Falls back to the location for event types that are not video calls —
      // a phone number or an address is the "where" for those.
      const location = row.original.location || '';

      if (!url) {
        return (
          <RecordTableInlineCell>
            <TextOverflowTooltip value={location} />
          </RecordTableInlineCell>
        );
      }

      return (
        <RecordTableInlineCell>
          <a
            href={url}
            target="_blank"
            // noreferrer alongside noopener: the meeting URL points at a third
            // party and there is no reason to leak the CRM URL as referrer.
            rel="noopener noreferrer"
            className="text-primary hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            Join
          </a>
        </RecordTableInlineCell>
      );
    },
  },
];
