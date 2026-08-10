import { useMutation, useQuery } from '@apollo/client';
import { toast } from 'erxes-ui';

import {
  ENRICHMENT_LOGS,
  ENRICHMENT_PROVIDERS,
} from '@/enrichment/graphql/queries';
import { ENRICH_CUSTOMER } from '@/enrichment/graphql/mutations';

const CONTENT_TYPE = 'core:customer';

export const useEnrichmentProviders = (customerId?: string) => {
  const { data, loading, refetch } = useQuery(ENRICHMENT_PROVIDERS, {
    variables: { customerId },
    skip: !customerId,
    // The answer depends on the record's current fields, which an enrichment
    // changes — a cached list would keep offering a provider that has since
    // become usable, or vice versa.
    fetchPolicy: 'cache-and-network',
  });

  return {
    providers: data?.enrichmentProviders || [],
    loading,
    refetch,
  };
};

export const useEnrichmentLogs = (customerId?: string) => {
  const { data, loading, refetch } = useQuery(ENRICHMENT_LOGS, {
    variables: { contentType: CONTENT_TYPE, contentId: customerId },
    skip: !customerId,
  });

  return {
    logs: data?.enrichmentLogs || [],
    loading,
    refetch,
  };
};

export const useEnrichCustomer = ({
  customerId,
  onDone,
}: {
  customerId?: string;
  onDone?: () => void;
}) => {
  const [mutate, { loading }] = useMutation(ENRICH_CUSTOMER);

  const enrich = (provider: string, overrides?: Record<string, string>) =>
    mutate({
      variables: { customerId, provider, overrides },
      // The customer's own fields change on a hit, and both the provider list
      // and the log are derived from them, so all three are refetched rather
      // than patched — the shapes differ enough that hand-writing cache updates
      // would be the more fragile choice.
      refetchQueries: [
        {
          query: ENRICHMENT_PROVIDERS,
          variables: { customerId },
        },
        {
          query: ENRICHMENT_LOGS,
          variables: { contentType: CONTENT_TYPE, contentId: customerId },
        },
      ],
      awaitRefetchQueries: true,
    })
      .then(({ data }) => {
        const result = data?.enrichCustomer;

        // Every outcome is reported, including the ones that are not errors:
        // silence after pressing a button reads as a broken button.
        if (result?.outcome === 'hit') {
          const count = Object.keys(result.written || {}).length;
          toast({
            title: `${result.provider} found a match`,
            description: `${count} field${count === 1 ? '' : 's'} updated.`,
          });
        } else {
          toast({
            title: result?.message || 'Nothing found',
            variant: result?.outcome === 'error' ? 'destructive' : 'default',
          });
        }

        onDone?.();
        return result;
      })
      .catch((error) => {
        toast({ title: error.message, variant: 'destructive' });
        return null;
      });

  return { enrich, loading };
};
