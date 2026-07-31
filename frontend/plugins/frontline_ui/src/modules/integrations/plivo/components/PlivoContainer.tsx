import { useCallback } from 'react';
import { PlivoProvider } from '@/integrations/plivo/components/PlivoProvider';
import { PlivoUnconfiguredWidget } from '@/integrations/plivo/components/PlivoUnconfiguredWidget';
import { usePlivoSoftphoneCredentials } from '@/integrations/plivo/hooks/usePlivoSoftphoneCredentials';
import { usePlivoSoftphoneIntegrations } from '@/integrations/plivo/hooks/usePlivoSoftphoneIntegrations';

/**
 * Mounts the softphone for the Plivo number the agent is answering for.
 *
 * The number is discovered here rather than assumed: with exactly one connected
 * number it is selected automatically, and with several the agent picks one
 * from the widget itself. Previously the choice existed only on the channel
 * settings page, so an agent who never opened that page had no softphone at
 * all and no way to find out why.
 *
 * The client is still only mounted once SIP credentials have actually been
 * issued — a half-configured client would either sit permanently in an error
 * state or, worse, look online while being unable to receive a call. What
 * changed is that
 * "not configured yet" now renders a launcher explaining itself instead of
 * rendering nothing: an invisible widget is indistinguishable from a broken
 * deploy, which is exactly how this was reported.
 *
 * Nothing at all renders when the account has no Plivo integration, so an
 * account that does not use Plivo never sees a dead button.
 */
export const PlivoContainer = ({ children }: { children: React.ReactNode }) => {
  const { integrations, integrationId, selectIntegration, loading } =
    usePlivoSoftphoneIntegrations();

  const {
    credentials,
    loading: credentialsLoading,
    refetchCredentials,
  } = usePlivoSoftphoneCredentials(integrationId);

  // The provider asks for this when Plivo refuses a login for a reason a fresh
  // credential could plausibly fix. It is NOT expiry — a SIP password does not
  // expire — but the endpoint can have been rotated or re-provisioned since
  // this password was issued, and refetching re-runs `ensurePlivoEndpoint`,
  // which reconciles our stored password against the endpoint that actually
  // exists at Plivo. That is the only self-repair available on this path.
  const handleCredentialsRejected = useCallback(() => {
    refetchCredentials();
  }, [refetchCredentials]);

  // Nothing is known yet; showing a launcher now would flash one on every page
  // load for accounts that have no Plivo number.
  if (loading && !integrations.length) {
    return null;
  }

  if (!integrations.length) {
    return null;
  }

  if (
    !integrationId ||
    credentialsLoading ||
    !credentials?.username ||
    !credentials?.password
  ) {
    return (
      <PlivoUnconfiguredWidget
        integrations={integrations}
        integrationId={integrationId}
        onIntegrationChange={selectIntegration}
        connecting={credentialsLoading}
      />
    );
  }

  return (
    <PlivoProvider
      username={credentials.username}
      password={credentials.password}
      phoneNumber={credentials.phoneNumber}
      onCredentialsRejected={handleCredentialsRejected}
    >
      {children}
    </PlivoProvider>
  );
};
