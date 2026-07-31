import { useQuery } from '@apollo/client';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import { PLIVO_CALL_HISTORIES } from '@/integrations/plivo/graphql/queries/plivoQueries';
import {
  plivoIntegrationIdAtom,
  plivoStateAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  IPlivoCallHistoryList,
  PlivoCallStatusEnum,
  PlivoHistoryDirection,
} from '@/integrations/plivo/types/plivoTypes';

export const PLIVO_CALL_HISTORIES_PER_PAGE = 20;

interface UsePlivoCallHistoriesArgs {
  direction?: PlivoHistoryDirection;
  /** `true` for voicemails only, `false` to exclude them, omitted for both. */
  isVoicemail?: boolean;
  searchValue?: string;
}

/**
 * A page of Plivo call history for the number this agent is answering on.
 *
 * Scoped to the selected integration rather than the whole account: the widget
 * this feeds is the agent's own phone, and an agent answering one number has no
 * business reading another queue's call log from it.
 *
 * REAL-TIME
 * ---------
 * This plugin has no GraphQL subscription for call sessions — the Grandstream
 * module's subscriptions cover queue statistics, not history rows — and the
 * rows are written by Plivo's server-to-server callbacks, so nothing in this
 * browser knows a call was recorded.
 *
 * What this browser DOES know is when its own call ended, which is the only
 * moment a new row can appear for the agent looking at the list. So the query
 * refetches on the softphone's transition back to IDLE rather than polling: a
 * poll would keep hitting the server for every agent all day to catch an event
 * the client is already told about. `cache-and-network` covers the other case —
 * a call taken elsewhere — by re-checking whenever the list is mounted.
 */
export const usePlivoCallHistories = ({
  direction,
  isVoicemail,
  searchValue,
}: UsePlivoCallHistoriesArgs = {}) => {
  const integrationId = useAtomValue(plivoIntegrationIdAtom);
  const { callStatus } = useAtomValue(plivoStateAtom);

  const { data, loading, error, fetchMore, refetch } = useQuery<{
    plivoCallHistories: IPlivoCallHistoryList;
  }>(PLIVO_CALL_HISTORIES, {
    variables: {
      integrationId,
      limit: PLIVO_CALL_HISTORIES_PER_PAGE,
      skip: 0,
      ...(direction ? { direction } : {}),
      ...(isVoicemail === undefined ? {} : { isVoicemail }),
      ...(searchValue ? { searchValue } : {}),
    },
    // The list decides whether an agent sees a voicemail waiting, so a cached
    // page is shown immediately but always re-checked against the server.
    fetchPolicy: 'cache-and-network',
    skip: !integrationId,
  });

  const previousCallStatus = useRef(callStatus);

  useEffect(() => {
    const wasOnACall =
      previousCallStatus.current !== PlivoCallStatusEnum.IDLE &&
      previousCallStatus.current !== undefined;

    previousCallStatus.current = callStatus;

    // The row for a call is written by Plivo's hangup callback, which races the
    // browser's own return to idle — so refetching the instant the call ends
    // can read the log back before the row exists. A short delay lets the
    // callback land, and the query still self-corrects on the next mount.
    if (wasOnACall && callStatus === PlivoCallStatusEnum.IDLE && integrationId) {
      const timer = setTimeout(() => {
        refetch();
      }, 2000);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [callStatus, integrationId, refetch]);

  const callHistories = data?.plivoCallHistories?.list;
  const totalCount = data?.plivoCallHistories?.totalCount ?? 0;

  const handleFetchMore = useCallback(
    () =>
      fetchMore({
        variables: { skip: callHistories?.length || 0 },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult?.plivoCallHistories?.list?.length) {
            return prev;
          }

          return {
            ...prev,
            plivoCallHistories: {
              ...fetchMoreResult.plivoCallHistories,
              list: [
                ...(prev.plivoCallHistories?.list || []),
                ...fetchMoreResult.plivoCallHistories.list,
              ],
            },
          };
        },
      }),
    [fetchMore, callHistories?.length],
  );

  return {
    callHistories,
    totalCount,
    loading,
    error,
    refetch,
    handleFetchMore,
  };
};
