import { IconSettings, IconSparkles } from '@tabler/icons-react';
import { useQuery } from '@apollo/client';
import { Breadcrumb, Button, Separator, Spinner } from 'erxes-ui';
import { PageHeader, createFavoriteBreadcrumb } from 'ui-modules';
import { Link } from 'react-router-dom';

import { ENRICHMENT_CONFIG_STATUS } from '@/enrichment/graphql/queries';

const LABELS: Record<string, string> = {
  SURFE_API_KEY: 'Surfe',
  APOLLO_API_KEY: 'Apollo.io',
  HUNTER_API_KEY: 'Hunter.io',
  SUREPASS_API_TOKEN: 'Surepass (GSTIN / DIN)',
};

const DESCRIPTIONS: Record<string, string> = {
  SURFE_API_KEY:
    'Finds contact details from a LinkedIn URL, or a name plus company.',
  APOLLO_API_KEY:
    'B2B database. Works from a name, an email or a LinkedIn URL; a company improves the match.',
  HUNTER_API_KEY:
    'Finds and verifies work email addresses from a name plus a company or domain.',
  SUREPASS_API_TOKEN:
    'Indian statutory records. Needs a GSTIN or DIN — it cannot search by name.',
};

type TStatus = {
  code: string;
  isSet: boolean;
  source: string;
};

/**
 * Overview of which providers are usable.
 *
 * Enrichment itself is run from the Enrichment tab on a contact — there is no
 * bulk action here on purpose: each lookup spends a credit, and a page that
 * could enrich every record at once would spend them faster than anyone means
 * to.
 */
export const IndexPage = () => {
  const favoriteBreadcrumb = createFavoriteBreadcrumb('Enrichment');
  const { data, loading } = useQuery(ENRICHMENT_CONFIG_STATUS);

  const statuses: TStatus[] = data?.enrichmentConfigStatus || [];
  const configured = statuses.filter((s) => s.isSet).length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <PageHeader.Start>
          <Breadcrumb>
            <Breadcrumb.List className="gap-1">
              <Breadcrumb.Item>
                <Button variant="ghost" asChild>
                  <Link to="/enrichment/providers">
                    <IconSparkles />
                    Enrichment
                  </Link>
                </Button>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb>
          <Separator.Inline />
          <PageHeader.FavoriteToggleButton
            breadcrumb={favoriteBreadcrumb}
            icon="IconSparkles"
          />
        </PageHeader.Start>
        <PageHeader.End>
          <Button variant="outline" asChild>
            <Link to="/settings/enrichment/providers">
              <IconSettings />
              Manage API keys
            </Link>
          </Button>
        </PageHeader.End>
      </PageHeader>

      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-auto flex-auto gap-6 p-6">
          <div>
            <h2 className="text-xl font-semibold">Providers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading
                ? 'Checking which providers are configured…'
                : `${configured} of ${statuses.length} configured. Run a lookup from the Enrichment tab on any contact.`}
            </p>
          </div>

          {loading && !statuses.length ? (
            <div className="flex items-center justify-center p-8">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {statuses.map((status) => (
                <div
                  key={status.code}
                  className="rounded-lg border bg-card p-4 text-card-foreground"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      {LABELS[status.code] || status.code}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {status.isSet
                        ? status.source === 'environment'
                          ? 'Set from the deployment environment'
                          : 'Configured'
                        : 'Not configured'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {DESCRIPTIONS[status.code]}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
