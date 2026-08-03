import { useMutation, useQuery } from '@apollo/client';
import {
  IconAlertTriangle,
  IconCheck,
  IconPlugConnected,
} from '@tabler/icons-react';
import { Badge, Button, Skeleton, toast } from 'erxes-ui';

import {
  CALCOM_PROVISION_WEBHOOK,
  CALCOM_WEBHOOK_HEALTH_QUERY,
} from '~/modules/bookings/graphql/queries/config';

type WebhookStatus = 'ok' | 'missing' | 'misconfigured' | 'unconfigured';

interface IWebhookHealth {
  status: WebhookStatus;
  webhookId?: string;
  subscriberUrl?: string;
  problems?: string[];
}

/**
 * Copy per state. Each says what is wrong AND what happens next, because the
 * symptom of every failure here is identical — bookings simply do not appear —
 * so the status text is the only thing that distinguishes them.
 */
const STATE_COPY: Record<
  WebhookStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive'; body: string }
> = {
  ok: {
    label: 'Connected',
    variant: 'success',
    body: 'Cal.com is delivering booking events to this CRM.',
  },
  missing: {
    label: 'Not connected',
    variant: 'warning',
    body: 'Cal.com has no subscription pointing here, so no bookings will arrive. Connecting creates one and sets its signing secret.',
  },
  misconfigured: {
    label: 'Needs repair',
    variant: 'warning',
    body: 'A subscription exists but will not deliver correctly.',
  },
  unconfigured: {
    label: 'API key needed',
    variant: 'destructive',
    body: 'Set the Cal.com API key below first — creating a webhook requires it.',
  },
};

/**
 * Webhook subscription health, with one-click repair.
 *
 * This replaces the old setup path: create a webhook in Cal.com by hand, copy
 * its signing secret, paste it into erxes. Three manual steps where one typo
 * fails silently — every delivery is rejected as unsigned, and the only symptom
 * is that no bookings ever appear.
 */
export const WebhookHealthCard = () => {
  const { data, loading, refetch } = useQuery<{
    calcomWebhookHealth: IWebhookHealth;
  }>(CALCOM_WEBHOOK_HEALTH_QUERY, {
    // Reads Cal.com live; a cached answer would report a subscription that may
    // since have been deleted or disabled there.
    fetchPolicy: 'network-only',
  });

  const [provision, { loading: provisioning }] = useMutation(
    CALCOM_PROVISION_WEBHOOK,
  );

  const health = data?.calcomWebhookHealth;
  const status = health?.status ?? 'unconfigured';
  const copy = STATE_COPY[status];

  const handleConnect = async () => {
    try {
      await provision();
      await refetch();

      toast({
        title: 'Cal.com connected',
        description: 'Booking events will now be delivered to this CRM.',
      });
    } catch (e) {
      toast({
        title: 'Could not connect',
        description: e instanceof Error ? e.message : 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <Skeleton className="h-28 w-full" />;
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconPlugConnected className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Webhook subscription</span>
        </div>
        <Badge variant={copy.variant}>
          {status === 'ok' ? (
            <IconCheck className="w-3 h-3" />
          ) : (
            <IconAlertTriangle className="w-3 h-3" />
          )}
          {copy.label}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{copy.body}</p>

      {/* Named specifically rather than summarised — "inactive" and "wrong
          events" need different fixes, and repair handles both. */}
      {!!health?.problems?.length && (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {health.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {health?.subscriberUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Delivering to
          </span>
          <code className="truncate rounded bg-muted px-2 py-1 text-xs">
            {health.subscriberUrl}
          </code>
        </div>
      )}

      {status !== 'unconfigured' && (
        <div className="flex items-center gap-2">
          <Button
            variant={status === 'ok' ? 'secondary' : 'default'}
            size="sm"
            disabled={provisioning}
            onClick={handleConnect}
          >
            {provisioning
              ? 'Connecting…'
              : status === 'ok'
                ? 'Reconnect'
                : 'Connect Cal.com'}
          </Button>

          {/* Reconnect is offered even when healthy, because rotating the
              signing secret is the fix for a leak — but it is labelled as a
              repair rather than a primary action so nobody presses it idly. */}
          {status === 'ok' && (
            <span className="text-xs text-muted-foreground">
              Rotates the signing secret.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
