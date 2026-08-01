import { useQuery } from '@apollo/client';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { PLIVO_SOFTPHONE_INTEGRATIONS } from '@/integrations/plivo/graphql/queries/plivoQueries';
import {
  plivoDefaultCountryCodeAtom,
  plivoIntegrationIdAtom,
  plivoUnregisteredAtom,
} from '@/integrations/plivo/states/plivoStates';
import { IPlivoSoftphoneIntegration } from '@/integrations/plivo/types/plivoTypes';

/**
 * The Plivo numbers this agent can answer on, plus the one currently selected.
 *
 * The floating widget is mounted app-wide with no channel in scope, so it
 * discovers its own integrations rather than depending on the agent having
 * visited the channel settings page and picked a number there — which was the
 * only way the softphone could ever appear.
 *
 * Selection rules:
 * - Exactly one usable number: select it automatically. There is nothing to
 *   choose, and asking would only hide the softphone behind a decision.
 * - Several: leave it unselected so the agent picks deliberately. Two agents
 *   answering the wrong queue is worse than one extra click, and the widget
 *   offers the picker itself.
 * - A stored id that no longer exists (integration removed or archived) is
 *   cleared, otherwise the widget would keep asking for a token it can never
 *   get.
 *
 * The choice persists in `plivoIntegrationIdAtom` (localStorage), so it
 * survives a reload and is never re-derived over an explicit pick.
 */
export const usePlivoSoftphoneIntegrations = () => {
  const [integrationId, setIntegrationId] = useAtom(plivoIntegrationIdAtom);
  const isUnregistered = useAtomValue(plivoUnregisteredAtom);
  const setUnregistered = useSetAtom(plivoUnregisteredAtom);

  /**
   * Picking a number is an explicit request to go online, so it clears any
   * earlier go-offline. Without this an agent who turned the phone off could
   * pick a number and watch nothing happen.
   */
  const selectIntegration = useCallback(
    (nextIntegrationId: string) => {
      setUnregistered(false);
      setIntegrationId(nextIntegrationId);
    },
    [setIntegrationId, setUnregistered],
  );

  const { data, loading, error } = useQuery<{
    plivoSoftphoneIntegrations: IPlivoSoftphoneIntegration[];
  }>(PLIVO_SOFTPHONE_INTEGRATIONS, {
    // The list changes when an admin connects or archives a number, and this
    // query decides whether an agent can be called at all, so a stale cached
    // list is re-checked on mount rather than trusted for the session.
    fetchPolicy: 'cache-and-network',
  });

  const integrations = data?.plivoSoftphoneIntegrations;

  const selectedIntegration = integrations?.find(
    (integration) => integration._id === integrationId,
  );

  // Published rather than returned because the surfaces that need it — the call
  // buttons and the contact list — render from other module federation entries
  // and cannot call this hook. `plivoReadyAtom` crosses the same boundary for
  // the same reason.
  const setDefaultCountryCode = useSetAtom(plivoDefaultCountryCodeAtom);
  const defaultCountryCode = selectedIntegration?.defaultCountryCode ?? null;

  useEffect(() => {
    setDefaultCountryCode(defaultCountryCode);
  }, [defaultCountryCode, setDefaultCountryCode]);

  useEffect(() => {
    // Only reconcile once the list has actually arrived: mid-flight `undefined`
    // must not be read as "no integrations" and wipe a valid stored choice.
    if (!integrations) {
      return;
    }

    const isStoredStillUsable =
      !!integrationId &&
      integrations.some((integration) => integration._id === integrationId);

    if (isStoredStillUsable) {
      return;
    }

    if (integrationId) {
      setIntegrationId(null);
      return;
    }

    // An agent who deliberately went offline stays offline. Auto-selecting here
    // would log them straight back in and start ringing their browser again,
    // which is the same reason `plivoUnregisteredAtom` is persisted at all.
    if (integrations.length === 1 && !isUnregistered) {
      setIntegrationId(integrations[0]._id);
    }
  }, [integrations, integrationId, isUnregistered, setIntegrationId]);

  return {
    integrations: integrations ?? [],
    integrationId,
    /** Picks a number and brings the phone online. */
    selectIntegration,
    /** Raw setter, for the settings control that can also clear the choice. */
    setIntegrationId,
    loading,
    error,
  };
};
