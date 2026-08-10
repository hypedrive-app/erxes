import { IconSparkles } from '@tabler/icons-react';
import { Badge, Button, Spinner } from 'erxes-ui';
import { useState } from 'react';

import {
  useEnrichCustomer,
  useEnrichmentLogs,
  useEnrichmentProviders,
} from '@/enrichment/hooks/useEnrichment';

type TProvider = {
  key: string;
  label: string;
  isConfigured: boolean;
  canHandle: boolean;
  reason?: string;
};

type TLog = {
  _id: string;
  provider: string;
  outcome: string;
  errorMessage?: string;
  result?: Record<string, string>;
  createdAt: string;
};

const OUTCOME_LABEL: Record<string, string> = {
  hit: 'Found',
  miss: 'No match',
  skipped: 'Skipped',
  error: 'Failed',
};

export const EnrichmentPanel = ({ customerId }: { customerId: string }) => {
  const { providers, loading: providersLoading } =
    useEnrichmentProviders(customerId);
  const { logs, loading: logsLoading } = useEnrichmentLogs(customerId);
  const { enrich, loading: enriching } = useEnrichCustomer({ customerId });

  // Which provider's button was pressed, so only that one shows a spinner
  // rather than the whole list going busy.
  const [running, setRunning] = useState<string | null>(null);

  const run = async (key: string) => {
    setRunning(key);
    await enrich(key);
    setRunning(null);
  };

  if (providersLoading && !providers.length) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h3 className="text-sm font-semibold">Enrich this contact</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Each provider looks the contact up in its own database. A lookup
          spends a credit, so providers that cannot use this record's details
          are disabled rather than tried.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {providers.map((provider: TProvider) => {
          const disabled =
            !provider.isConfigured || !provider.canHandle || enriching;

          return (
            <div
              key={provider.key}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{provider.label}</div>
                {provider.reason && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {provider.reason}
                  </div>
                )}
              </div>

              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => run(provider.key)}
              >
                {running === provider.key ? (
                  <Spinner size="sm" />
                ) : (
                  <IconSparkles size={14} />
                )}
                Enrich
              </Button>
            </div>
          );
        })}

        {!providers.length && (
          <p className="text-sm text-muted-foreground">
            No providers are configured yet. Add an API key under Settings →
            Enrichment → Providers.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold">History</h4>

        {logsLoading && !logs.length ? (
          <div className="p-4">
            <Spinner size="sm" />
          </div>
        ) : logs.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {logs.map((log: TLog) => (
              <li
                key={log._id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{log.provider}</span>
                  {log.errorMessage && (
                    <div className="text-xs text-muted-foreground">
                      {log.errorMessage}
                    </div>
                  )}
                </div>
                <Badge
                  variant={
                    log.outcome === 'hit'
                      ? 'default'
                      : log.outcome === 'error'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {OUTCOME_LABEL[log.outcome] || log.outcome}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          // An empty history is a normal state on a contact nobody has enriched
          // yet; saying so beats a blank area that reads as still-loading.
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing has been looked up for this contact yet.
          </p>
        )}
      </div>
    </div>
  );
};
