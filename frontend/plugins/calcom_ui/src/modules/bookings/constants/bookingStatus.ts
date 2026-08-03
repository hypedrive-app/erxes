/**
 * Cal.com booking statuses, as they arrive on the wire.
 *
 * Cal.com sends these uppercase; they are lowercased for display rather than
 * mapped one-by-one so an unrecognised status still renders as itself instead
 * of vanishing behind a fallback.
 */
export const CALCOM_BOOKING_STATUSES = [
  'ACCEPTED',
  'PENDING',
  'CANCELLED',
  'REJECTED',
] as const;

export type CalcomBookingStatus = (typeof CALCOM_BOOKING_STATUSES)[number];

/**
 * Badge variants per status, using erxes-ui's actual variant set.
 *
 * Cancelled and rejected are both destructive: from the CRM's point of view the
 * meeting is not happening, and the distinction between "called off" and
 * "declined" is carried by the label, not the colour.
 */
export type CalcomStatusVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'ghost';

export const CALCOM_STATUS_VARIANT: Record<string, CalcomStatusVariant> = {
  ACCEPTED: 'success',
  PENDING: 'warning',
  CANCELLED: 'destructive',
  REJECTED: 'destructive',
};

// Falls back to `secondary` rather than throwing: Cal.com can add a status we
// do not know about, and an unstyled-but-visible badge beats a crashed table.
export const getStatusVariant = (status?: string): CalcomStatusVariant =>
  CALCOM_STATUS_VARIANT[status ?? ''] ?? 'secondary';
