import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useMutation, useQuery } from '@apollo/client';
import { Badge, Button, Input, Spinner, toast } from 'erxes-ui';
import { useState } from 'react';

import { ENRICHMENT_SET_CONFIG } from '@/enrichment/graphql/mutations';
import { ENRICHMENT_CONFIG_STATUS } from '@/enrichment/graphql/queries';

const PROVIDERS: Record<
  string,
  { label: string; needs: string; where: string }
> = {
  SURFE_API_KEY: {
    label: 'Surfe',
    needs: 'A LinkedIn URL, or a name plus a company.',
    where: 'app.surfe.com → Settings → API',
  },
  APOLLO_API_KEY: {
    label: 'Apollo.io',
    needs: 'A name, an email or a LinkedIn URL. A company improves the match.',
    where: 'app.apollo.io → Settings → Integrations → API',
  },
  HUNTER_API_KEY: {
    label: 'Hunter.io',
    needs: 'A name plus a company or domain.',
    where: 'hunter.io → API → API Keys',
  },
  SUREPASS_API_TOKEN: {
    label: 'Surepass',
    needs: 'A GSTIN or a DIN. It looks up filed records and cannot search by name.',
    where: 'Shared with this deployment’s KYC service',
  },
};

type TStatus = {
  code: string;
  isSet: boolean;
  source: string;
};

/**
 * Provider credentials.
 *
 * Status first, then the field that changes it — the same order as Cal.com's
 * settings, and for the same reason: the first question on this screen is
 * "which providers actually work right now", and the answer sits directly
 * above the input that fixes it.
 */
export const EnrichmentSettings = () => {
  const { data, loading, refetch } = useQuery(ENRICHMENT_CONFIG_STATUS);
  const [setConfig, { loading: saving }] = useMutation(ENRICHMENT_SET_CONFIG);

  // Values are never read back from the server — only whether one is set — so
  // the inputs start empty and a blank field means "leave it alone".
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const save = async (code: string) => {
    setSavingCode(code);

    try {
      await setConfig({ variables: { code, value: values[code] || '' } });
      setValues((prev) => ({ ...prev, [code]: '' }));
      await refetch();

      toast({
        title: values[code]
          ? `${PROVIDERS[code]?.label || code} key saved`
          : `${PROVIDERS[code]?.label || code} key cleared`,
      });
    } catch (error) {
      toast({ title: (error as Error).message, variant: 'destructive' });
    } finally {
      setSavingCode(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const statuses: TStatus[] = data?.enrichmentConfigStatus || [];
  const ready = statuses.filter((s) => s.isSet).length;

  return (
    <div className="flex flex-col gap-8 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Enrichment</h1>
        <p className="mt-1 text-muted-foreground">
          Look a contact up in a provider&apos;s database and write what it
          finds onto their record. Run it from the Enrichment tab on any
          contact.
        </p>

        <div className="mt-4">
          {ready ? (
            <Badge>
              <IconCheck size={14} />
              {ready} of {statuses.length} providers ready
            </Badge>
          ) : (
            <Badge variant="secondary">
              <IconAlertTriangle size={14} />
              No providers configured yet
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {statuses.map((status) => {
          const provider = PROVIDERS[status.code];

          return (
            <div
              key={status.code}
              className="flex flex-col gap-3 rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {provider?.label || status.code}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {provider?.needs}
                  </p>
                </div>

                <Badge variant={status.isSet ? 'default' : 'secondary'}>
                  {status.isSet
                    ? status.source === 'environment'
                      ? 'From environment'
                      : 'Configured'
                    : 'Not set'}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    status.isSet ? 'Replace key…' : 'Paste API key'
                  }
                  value={values[status.code] || ''}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [status.code]: e.target.value,
                    }))
                  }
                />
                <Button
                  variant="secondary"
                  // Disabled when there is nothing to do: no typed value and no
                  // stored key means Save would be a no-op, and a button that
                  // does nothing reads as broken.
                  disabled={
                    saving || (!values[status.code] && !status.isSet)
                  }
                  onClick={() => save(status.code)}
                >
                  {savingCode === status.code ? (
                    <Spinner size="sm" />
                  ) : values[status.code] ? (
                    'Save'
                  ) : (
                    'Clear'
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {provider?.where}
                {status.source === 'database' &&
                  ' · Saving an empty field clears the stored key and falls back to the deployment environment.'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
