import { useQuery } from '@apollo/client';
import {
  IconCalendarPlus,
  IconExternalLink,
  IconVideo,
} from '@tabler/icons-react';
import { Badge, Skeleton } from 'erxes-ui';

import { CALCOM_BOOKING_EXTRAS_QUERY } from '~/modules/bookings/graphql/queries/bookings';

interface ICalendarLink {
  label?: string;
  link?: string;
}

interface IRecording {
  id?: string;
  status?: string;
  duration?: number;
  downloadLink?: string;
}

interface IReference {
  id?: number;
  type?: string;
  uid?: string;
  meetingUrl?: string;
  externalCalendarId?: string;
}

const Section = ({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
    </div>
    {children}
  </div>
);

const formatDuration = (seconds?: number) => {
  if (!seconds) return null;

  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

/**
 * The parts of a booking that live in Cal.com rather than the mirror.
 *
 * Loaded only when this component mounts — the detail sheet renders it behind a
 * tab — because each field here is a separate outbound API call. Folding them
 * into the main booking query would make opening any booking four round trips
 * slower for information most people never look at.
 */
export const BookingExtras = ({ uid }: { uid?: string }) => {
  const { data, loading, error } = useQuery<{
    calcomBookingCalendarLinks: ICalendarLink[];
    calcomBookingRecordings: IRecording[];
    calcomBookingReferences: IReference[];
  }>(CALCOM_BOOKING_EXTRAS_QUERY, {
    variables: { uid },
    skip: !uid,
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    // Shown rather than hidden: every field here needs the Cal.com API key, so
    // a failure almost always means the key is missing or wrong — and saying
    // so points at the fix instead of leaving four empty sections.
    return (
      <p className="text-sm text-muted-foreground">
        Could not reach Cal.com for these details. Check the API key in
        Settings → Cal.com.
      </p>
    );
  }

  const calendarLinks = data?.calcomBookingCalendarLinks ?? [];
  const recordings = data?.calcomBookingRecordings ?? [];
  const references = data?.calcomBookingReferences ?? [];

  return (
    <div className="flex flex-col gap-6">
      {!!calendarLinks.length && (
        <Section icon={IconCalendarPlus} title="Add to calendar">
          <div className="flex flex-wrap gap-2">
            {calendarLinks.map((link) => (
              <a
                key={link.link}
                href={link.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-accent"
              >
                {link.label}
                <IconExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Cal Video only. A Google Meet or Zoom booking legitimately has none,
          so these sections are omitted rather than shown empty — an empty
          "Recordings" heading reads as a fault.

          LINK-OUT ONLY, deliberately: no embedded player, no download button.
          A meeting recording is consent-sensitive (two-party-consent states,
          GDPR), and the consent for it was captured — or not — by whoever
          configured Cal.com. Downloading or embedding it here would make the
          CRM a second controller of that media. Opening Cal.com's own
          authenticated view leaves that responsibility where it already sits.
          Do not "improve" this into an inline player. */}
      {!!recordings.length && (
        <Section icon={IconVideo} title="Recordings">
          <ul className="flex flex-col gap-2">
            {recordings.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  {rec.status && (
                    <Badge
                      variant={rec.status === 'finished' ? 'success' : 'warning'}
                    >
                      {rec.status}
                    </Badge>
                  )}
                  {formatDuration(rec.duration) && (
                    <span className="text-muted-foreground">
                      {formatDuration(rec.duration)}
                    </span>
                  )}
                </div>
                {rec.downloadLink && (
                  <a
                    href={rec.downloadLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open in Cal.com
                    <IconExternalLink className="w-3 h-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Transcripts are deliberately NOT surfaced, and not even queried.
          Consent stakes are higher than for recordings — a transcript is the
          full verbatim text — and Cal.com's retrieval links are short-lived, so
          a link rendered here would often be dead by the time anyone clicked
          it. Surfacing them needs a stable authenticated retrieval path first.
          The backend query exists (calcomBookingTranscripts) for automations. */}

      {/* Diagnostic, and labelled as such: this is what answers "the booking
          exists in Cal.com but it is not in my calendar". */}
      {!!references.length && (
        <Section icon={IconExternalLink} title="Calendar records">
          <ul className="flex flex-col gap-1 text-sm">
            {references.map((ref) => (
              <li key={ref.id ?? ref.uid} className="flex items-center gap-2">
                <Badge variant="secondary">{ref.type || 'unknown'}</Badge>
                <span className="truncate text-muted-foreground">
                  {ref.externalCalendarId || ref.uid || '—'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!calendarLinks.length && !recordings.length && !references.length && (
        <p className="text-sm text-muted-foreground">
          Nothing extra for this booking yet. Recordings only exist for meetings
          held on Cal Video.
        </p>
      )}
    </div>
  );
};
