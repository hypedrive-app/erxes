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
  // Written field codes mapped to their values, plus `providerPayload` — the
  // provider's raw response object — so this cannot be Record<string, string>.
  result?: Record<string, unknown>;
  createdAt: string;
};

const OUTCOME_LABEL: Record<string, string> = {
  hit: 'Found',
  miss: 'No match',
  skipped: 'Skipped',
  error: 'Failed',
};

const PROVIDER_LABELS: Record<string, string> = {
  surfe: 'Surfe',
  apollo: 'Apollo.io',
  hunter: 'Hunter.io',
  surepass: 'Surepass',
};

// Field codes are how the backend keys what it wrote; this turns them into the
// names the operator sees on the properties tab.
const FIELD_LABELS: Record<string, string> = {
  enrichment_job_title: 'job title',
  enrichment_seniority: 'seniority',
  enrichment_linkedin: 'LinkedIn',
  enrichment_company_name: 'company',
  enrichment_company_domain: 'domain',
  enrichment_company_size: 'company size',
  enrichment_company_industry: 'industry',
  enrichment_location: 'location',
  email: 'email',
};

// Bookkeeping the operator did not ask about — every hit sets these, so listing
// them would bury the fields that actually differ between one run and the next.
const NOT_WORTH_LISTING = new Set([
  'enrichment_source',
  'enrichment_date',
  'providerPayload',
]);

const describeWritten = (result?: Record<string, unknown>) => {
  if (!result) {
    return 'Updated the contact.';
  }

  const fields = Object.keys(result)
    .filter((key) => !NOT_WORTH_LISTING.has(key))
    .map((key) => FIELD_LABELS[key] || key);

  if (!fields.length) {
    return 'Updated the contact.';
  }

  return `Wrote ${fields.join(', ')}.`;
};

const formatWhen = (value?: string) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
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
          <ul className="mt-2 flex flex-col gap-3">
            {logs.map((log: TLog) => (
              <li key={log._id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium">
                      {PROVIDER_LABELS[log.provider] || log.provider}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatWhen(log.createdAt)}
                    </span>
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
                </div>

                {log.errorMessage && (
                  <p className="text-xs text-muted-foreground">
                    {log.errorMessage}
                  </p>
                )}

                {/* What a hit actually wrote. Without this the history says a
                    provider found something but not what, which is the one
                    thing worth knowing when deciding whether to try another. */}
                {log.outcome === 'hit' && (
                  <p className="text-xs text-muted-foreground">
                    {describeWritten(log.result)}
                  </p>
                )}
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
