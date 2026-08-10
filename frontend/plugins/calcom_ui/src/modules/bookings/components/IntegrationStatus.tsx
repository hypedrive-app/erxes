import {
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
} from '@tabler/icons-react';
import { Badge, Button, Skeleton } from 'erxes-ui';

import { useCalcomBookings } from '~/modules/bookings/hooks/useCalcomBookings';
import { useCalcomEventTypes } from '~/modules/bookings/hooks/useCalcomScheduling';

const Row = ({
  label,
  description,
  ok,
  loading,
  detail,
}: {
  label: string;
  description: string;
  ok: boolean;
  loading?: boolean;
  detail?: string;
}) => (
  <div className="flex items-start justify-between gap-4 border-b py-4 last:border-b-0">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        {loading ? (
          <Skeleton className="h-5 w-20" />
        ) : (
          <Badge variant={ok ? 'success' : 'warning'}>
            {ok ? (
              <>
                <IconCheck className="w-3 h-3" /> Working
              </>
            ) : (
              <>
                <IconAlertTriangle className="w-3 h-3" /> Not set up
              </>
            )}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  </div>
);

/**
 * Shows whether the two halves of the integration are actually working.
 *
 * They fail independently and for different reasons, which is the whole point
 * of separating them here: the mirror fills from inbound webhooks
 * (CALCOM_WEBHOOK_SECRET + a subscription in Cal.com), while cancelling,
 * rescheduling and booking need an outbound API key. Either can be broken while
 * the other looks fine, and without this the symptom is just "nothing happens"
 * on a screen that gives no clue which half is at fault.
 *
 * Both checks are inferred from real queries rather than reported by the
 * backend. There is no status endpoint, and adding one that merely echoed
 * whether an env var is non-empty would confirm configuration, not function —
 * a wrong key would still report healthy.
 */
export const CalcomIntegrationStatus = () => {
  // Any mirrored booking proves a signed webhook was received and stored.
  const { totalCount, loading: loadingBookings } = useCalcomBookings({
    perPage: 1,
  });

  // Event types can only be read with a working API key, so a successful
  // response is proof of the outbound direction.
  const {
    eventTypes,
    loading: loadingTypes,
    error: eventTypesError,
  } = useCalcomEventTypes();

  const webhooksWorking = totalCount > 0;

  // A successful call is what proves the key works — not whether it returned
  // anything. An account with a valid key and no event types yet is a normal
  // state, and reporting it as "usually a missing or invalid CALCOM_API_KEY"
  // sends someone to rotate a key that was fine.
  const apiWorking = !eventTypesError;
  const hasEventTypes = eventTypes.length > 0;

  return (
    <div className="flex flex-col">
      <Row
        label="Incoming bookings"
        description="Cal.com sends a signed webhook for every booking, and this plugin mirrors it into the CRM."
        ok={webhooksWorking}
        loading={loadingBookings}
        detail={
          webhooksWorking
            ? `${totalCount} booking${totalCount === 1 ? '' : 's'} mirrored.`
            : 'No bookings yet. If Cal.com already has some, the webhook subscription or its secret is likely wrong.'
        }
      />

      <Row
        label="Booking actions"
        description="Cancelling, rescheduling and booking a time from erxes call the Cal.com API."
        ok={apiWorking}
        loading={loadingTypes}
        detail={
          !apiWorking
            ? 'Cal.com rejected the request — usually a missing or invalid CALCOM_API_KEY.'
            : hasEventTypes
              ? `${eventTypes.length} event type${
                  eventTypes.length === 1 ? '' : 's'
                } available to book.`
              : 'Connected, but no event types exist yet. Create one in Cal.com before booking from here.'
        }
      />

      {/* Points at Cal.com Cloud rather than a specific self-hosted host.
          The instance this plugin talks to is CALCOM_API_URL, but the config
          query deliberately returns only whether each key is set — never its
          value — so the host cannot be derived here. A hardcoded host was
          worse: it named one deployment's Cal.com and sent everyone else to a
          domain that is not theirs. */}
      <div className="pt-4">
        <Button variant="secondary" size="sm" asChild>
          <a
            href="https://app.cal.com/settings/developer/webhooks"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Cal.com webhook settings
            <IconExternalLink className="w-3.5 h-3.5" />
          </a>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Self-hosted? Use your own instance&apos;s
          /settings/developer/webhooks.
        </p>
      </div>
    </div>
  );
};
