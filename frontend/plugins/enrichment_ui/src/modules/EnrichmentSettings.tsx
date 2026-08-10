import { useMutation, useQuery } from '@apollo/client';
import { Button, Input, Spinner, toast } from 'erxes-ui';
import { useState } from 'react';

import { ENRICHMENT_SET_CONFIG } from '@/enrichment/graphql/mutations';
import { ENRICHMENT_CONFIG_STATUS } from '@/enrichment/graphql/queries';

const LABELS: Record<string, string> = {
  SURFE_API_KEY: 'Surfe',
  APOLLO_API_KEY: 'Apollo.io',
  HUNTER_API_KEY: 'Hunter.io',
  SUREPASS_API_TOKEN: 'Surepass (GSTIN / DIN)',
};

type TStatus = {
  code: string;
  isSet: boolean;
  source: string;
};

export const EnrichmentSettings = () => {
  const { data, loading, refetch } = useQuery(ENRICHMENT_CONFIG_STATUS);
  const [setConfig, { loading: saving }] = useMutation(ENRICHMENT_SET_CONFIG);

  // Values are never read back from the server — only whether one is set — so
  // the inputs start empty and a blank field means "leave it alone".
  const [values, setValues] = useState<Record<string, string>>({});

  const save = async (code: string) => {
    try {
      await setConfig({ variables: { code, value: values[code] || '' } });
      setValues((prev) => ({ ...prev, [code]: '' }));
      await refetch();
      toast({ title: `${LABELS[code] || code} updated` });
    } catch (error) {
      toast({ title: (error as Error).message, variant: 'destructive' });
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Enrichment providers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Keys are stored per workspace and are never shown again after saving.
          Leaving a field blank and saving clears the stored key, which makes
          the deployment&apos;s own environment value visible again.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {statuses.map((status) => (
          <div key={status.code} className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {LABELS[status.code] || status.code}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {status.isSet
                  ? status.source === 'environment'
                    ? 'set from the deployment environment'
                    : 'configured'
                  : 'not configured'}
              </span>
            </label>

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={status.isSet ? '••••••••' : 'Paste API key'}
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
                disabled={saving}
                onClick={() => save(status.code)}
              >
                Save
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
