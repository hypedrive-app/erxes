import { useQuery } from '@apollo/client';
import { PLIVO_INTEGRATION_CONFIGS } from '@/integrations/plivo/graphql/queries/plivoQueries';
import { IPlivoIntegrationConfig } from '@/integrations/plivo/types/plivoTypes';

/**
 * Every connected Plivo number with the routing settings the config screen
 * edits.
 *
 * `cache-and-network` because these settings decide whether a live inbound call
 * reaches anybody: a stale cached copy would be edited and saved back, silently
 * reverting a change another admin just made.
 */
export const usePlivoIntegrationConfigs = () => {
  const { data, loading, error } = useQuery<{
    plivoIntegrationConfigs: IPlivoIntegrationConfig[];
  }>(PLIVO_INTEGRATION_CONFIGS, { fetchPolicy: 'cache-and-network' });

  return {
    configs: data?.plivoIntegrationConfigs ?? [],
    loading,
    error,
  };
};
