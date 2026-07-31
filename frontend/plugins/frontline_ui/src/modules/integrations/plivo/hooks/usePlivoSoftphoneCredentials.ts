import { useQuery } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { PLIVO_SOFTPHONE_CREDENTIALS } from '@/integrations/plivo/graphql/queries/plivoQueries';
import { IPlivoSoftphoneCredentials } from '@/integrations/plivo/types/plivoTypes';

/**
 * Fetches the SIP credentials the browser SDK registers with.
 *
 * `network-only` so the password is never served from the Apollo cache. Unlike
 * the token this replaced it does not expire, but it CAN be rotated on the
 * server — `ensurePlivoEndpoint` rotates any endpoint whose password we do not
 * hold — and a cached copy replayed after that would authenticate as nothing.
 * Going to the network also keeps the credential out of any cache the devtools
 * or a persisted-cache link would expose.
 */
export const usePlivoSoftphoneCredentials = (integrationId?: string | null) => {
  const { t } = useTranslation('frontline');

  const { data, loading, error, refetch } = useQuery<{
    plivoSoftphoneCredentials: IPlivoSoftphoneCredentials | null;
  }>(PLIVO_SOFTPHONE_CREDENTIALS, {
    variables: { integrationId },
    skip: !integrationId,
    fetchPolicy: 'network-only',
    onError: (e) => {
      toast({
        title: t('plivo-credentials-failed'),
        description: e.message,
        variant: 'destructive',
      });
    },
  });

  return {
    credentials: data?.plivoSoftphoneCredentials ?? null,
    loading,
    error,
    refetchCredentials: refetch,
  };
};
