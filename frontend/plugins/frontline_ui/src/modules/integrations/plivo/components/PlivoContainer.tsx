import { useAtomValue } from 'jotai';
import { useCallback } from 'react';
import { PlivoProvider } from '@/integrations/plivo/components/PlivoProvider';
import { usePlivoAccessToken } from '@/integrations/plivo/hooks/usePlivoAccessToken';
import { plivoIntegrationIdAtom } from '@/integrations/plivo/states/plivoStates';

/**
 * Mounts the softphone for the Plivo number the agent is answering for.
 *
 * Renders nothing at all until an integration has been chosen and a token
 * minted: the widget sits on every page, and a half-configured client would
 * either sit permanently in an error state or, worse, look online while being
 * unable to receive a call.
 */
export const PlivoContainer = ({ children }: { children: React.ReactNode }) => {
  const integrationId = useAtomValue(plivoIntegrationIdAtom);

  const { accessToken, loading, refetchAccessToken } =
    usePlivoAccessToken(integrationId);

  // The provider asks for this when Plivo refuses a login, which for a
  // short-lived token is most often expiry rather than a broken integration.
  const handleTokenExpired = useCallback(() => {
    refetchAccessToken();
  }, [refetchAccessToken]);

  if (!integrationId || loading || !accessToken?.token) {
    return null;
  }

  return (
    <PlivoProvider
      accessToken={accessToken.token}
      phoneNumber={accessToken.phoneNumber}
      onTokenExpired={handleTokenExpired}
    >
      {children}
    </PlivoProvider>
  );
};
