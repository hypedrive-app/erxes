import { useQuery } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { PLIVO_ACCESS_TOKEN } from '@/integrations/plivo/graphql/queries/plivoQueries';
import { IPlivoAccessToken } from '@/integrations/plivo/types/plivoTypes';

/**
 * Fetches the short-lived access token the browser SDK logs in with.
 *
 * `network-only` because the token expires: a cached one replayed after a
 * remount would be rejected by Plivo and leave the agent silently offline.
 */
export const usePlivoAccessToken = (integrationId?: string | null) => {
  const { t } = useTranslation('frontline');

  const { data, loading, error, refetch } = useQuery<{
    plivoAccessToken: IPlivoAccessToken | null;
  }>(PLIVO_ACCESS_TOKEN, {
    variables: { integrationId },
    skip: !integrationId,
    fetchPolicy: 'network-only',
    onError: (e) => {
      toast({
        title: t('plivo-token-failed'),
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  return {
    accessToken: data?.plivoAccessToken ?? null,
    loading,
    error,
    refetchAccessToken: refetch,
  };
};
