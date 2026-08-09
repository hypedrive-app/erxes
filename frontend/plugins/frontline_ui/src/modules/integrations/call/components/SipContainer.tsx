import { callConfigAtom } from '@/integrations/call/states/sipStates';
import { useAtom, useAtomValue } from 'jotai';
import SipProvider from './SipProvider';
import { useCallCreateSession } from '@/integrations/call/hooks/useCallCreateSession';
import { useCallUserIntegration } from '@/integrations/call/hooks/useCallUserIntegration';
import { useCallGetConfigs } from '@/integrations/call/hooks/useCallGetConfigs';
import { useCurrentCallSession } from '@/integrations/call/hooks/useCurrentCallSession';
import { CallSelectConfig } from '@/integrations/call/components/CallSelectConfig';
import { historyIdAtom } from '@/integrations/call/states/callStates';

const CallSessionBridge = () => {
  useCurrentCallSession();
  return null;
};

export const SipContainer = ({ children }: { children: React.ReactNode }) => {
  const [callConfig] = useAtom(callConfigAtom);
  const historyId = useAtomValue(historyIdAtom);

  const { callUserIntegrations, loading: callUserIntegrationLoading } =
    useCallUserIntegration();
  const { callConfigs, loading: callConfigLoading } = useCallGetConfigs({
    skip: callUserIntegrationLoading || Boolean(!callUserIntegrations?.length),
  });

  const { createActiveSession } = useCallCreateSession();

  if (
    callUserIntegrationLoading ||
    callConfigLoading ||
    !callUserIntegrations?.length ||
    !Object.values(callConfigs)?.length
  ) {
    return null;
  }
  if (!callConfig?.inboxId) {
    return <CallSelectConfig callUserIntegrations={callUserIntegrations} />;
  }

  if (!callConfig.isAvailable) {
    return null;
  }

  const { wsServer, operators } = callConfig;

  const [host = 'call.erxes.io', port = '8089'] =
    (wsServer || '').split(':') || [];

  const operator = operators?.[0];

  // Only send servers that were actually configured. Interpolating an unset
  // value produced the literal string "turn:undefined", which is not a valid
  // ICE URL -- Chrome rejects the whole entry, so a deployment that never
  // filled in these settings was shipping a broken TURN server rather than
  // none at all. Omitting it lets ICE fall back to host/srflx candidates,
  // which is the honest representation of "no TURN configured".
  //
  // Note this only changes what the browser is asked to do; it cannot make
  // media flow where a relay is genuinely required. A caller behind symmetric
  // NAT still needs a real TURN server -- without one the call completes at
  // the SIP layer (and gets a duration in the CDR, which is derived purely
  // from signalling) while no RTP ever flows in either direction.
  const iceServers: RTCIceServer[] = [];

  if (callConfigs.TURN_SERVER_URL) {
    iceServers.push({
      urls: `turn:${callConfigs.TURN_SERVER_URL}`,
      username: callConfigs.TURN_SERVER_USERNAME,
      credential: callConfigs.TURN_SERVER_CREDENTIAL,
    });
  }

  if (callConfigs.STUN_SERVER_URL) {
    iceServers.push({ urls: `stun:${callConfigs.STUN_SERVER_URL}` });
  }

  const sipConfig = {
    host,
    pathname: '/ws',
    user: operator?.gsUsername,
    password: operator?.gsPassword,
    port: Number.parseInt(port?.toString() || '8089', 10),
    iceServers,
  };

  return (
    <SipProvider
      createSession={createActiveSession}
      historyId={historyId}
      {...sipConfig}
    >
      <CallSessionBridge />
      {children}
    </SipProvider>
  );
};
