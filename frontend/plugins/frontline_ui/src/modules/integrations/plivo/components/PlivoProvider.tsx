import Plivo from 'plivo-browser-sdk';
import type { Client } from 'plivo-browser-sdk/client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import {
  IPlivoMediaMetric,
  PlivoCallDirectionEnum,
  PlivoCallQualityEnum,
  PlivoCallStatusEnum,
  PlivoContextValue,
  PlivoErrorTypeEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';
import {
  plivoNumberAtom,
  plivoStateAtom,
  plivoUnregisteredAtom,
} from '@/integrations/plivo/states/plivoStates';

const PlivoContext = createContext<PlivoContextValue | null>(null);

/**
 * Options tuned for a CRM shell rather than a dedicated dialer page.
 *
 * `permOnClick` defers the microphone prompt to the first call — the widget is
 * mounted on every page, and prompting on load would ask an agent who may never
 * place a call. `closeProtection` warns before a tab close drops a live call.
 * `allowMultipleIncomingCalls` is off so a second inbound call cannot arrive
 * mid-conversation, matching how the Grandstream widget replies busy.
 */
const PLIVO_OPTIONS = {
  debug: 'ERROR' as const,
  permOnClick: true,
  closeProtection: true,
  enableTracking: true,
  enableQualityTracking: 'ALL' as const,
  allowMultipleIncomingCalls: false,
  audioConstraints: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  codecs: ['OPUS', 'PCMU', 'PCMA'],
  dscp: true,
};

/** Plivo reports a phone number as a bare string or a `sip:user@host` URI. */
const extractCounterpart = (value?: string | null): string => {
  if (!value) return '';

  if (!value.startsWith('sip:')) return value;

  const start = value.indexOf(':') + 1;
  const end = value.indexOf('@');

  return end > start ? value.slice(start, end) : value.slice(start);
};

export const PlivoProvider = ({
  accessToken,
  phoneNumber,
  onTokenExpired,
  children,
}: {
  accessToken: string;
  phoneNumber?: string | null;
  /** Asks the container for a fresh token when this one is refused. */
  onTokenExpired: () => void;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const [plivoState, setPlivoState] = useAtom(plivoStateAtom);
  const setCallNumber = useSetAtom(plivoNumberAtom);
  const [isUnregistered, setIsUnregistered] = useAtom(plivoUnregisteredAtom);

  const clientRef = useRef<Client | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read inside SDK callbacks, which are registered once and would otherwise
  // close over the state as it was at login time.
  const plivoStateRef = useRef(plivoState);
  const onTokenExpiredRef = useRef(onTokenExpired);
  const isUnregisteredRef = useRef(isUnregistered);

  useEffect(() => {
    plivoStateRef.current = plivoState;
  }, [plivoState]);

  useEffect(() => {
    onTokenExpiredRef.current = onTokenExpired;
  }, [onTokenExpired]);

  useEffect(() => {
    isUnregisteredRef.current = isUnregistered;
  }, [isUnregistered]);

  /**
   * Plays the remote stream, retrying once through the autoplay policy.
   *
   * A browser that has never seen a gesture on this origin rejects `play()`,
   * which would leave a connected call with no audio and no error shown. The
   * retry mirrors the Grandstream provider; if it also fails the agent is told,
   * because a silent call is otherwise indistinguishable from a dead one.
   */
  const playRemoteAudio = useCallback(() => {
    const element = remoteAudioRef.current;
    if (!element) return;

    const attempt = element.play();
    if (!attempt) return;

    attempt.catch(() => {
      audioRetryRef.current = setTimeout(() => {
        remoteAudioRef.current?.play().catch(() => {
          setPlivoState((prev) => ({
            ...prev,
            plivoErrorType: PlivoErrorTypeEnum.AUDIO_PLAYBACK,
            plivoErrorMessage: t('plivo-audio-blocked'),
          }));
          toast({
            title: t('plivo-audio-blocked'),
            variant: 'warning',
          });
        });
      }, 2000);
    });
  }, [setPlivoState, t]);

  const resetCallState = useCallback(() => {
    setPlivoState((prev) => ({
      ...prev,
      callStatus: PlivoCallStatusEnum.IDLE,
      callDirection: null,
      callCounterpart: null,
      callerName: null,
      callId: null,
      callQuality: PlivoCallQualityEnum.UNKNOWN,
      isMuted: false,
    }));
  }, [setPlivoState]);

  // The client is created once per token. Every handler is attached here
  // because the SDK has no way to replace a listener after login.
  useEffect(() => {
    if (!accessToken) return;

    const audioElement = document.createElement('audio');
    audioElement.id = 'plivo-provider-audio';
    audioElement.autoplay = true;
    document.body.appendChild(audioElement);
    remoteAudioRef.current = audioElement;

    const instance = new Plivo(PLIVO_OPTIONS);
    const client = instance.client;
    clientRef.current = client;

    setPlivoState((prev) => ({
      ...prev,
      plivoStatus: PlivoStatusEnum.CONNECTING,
      plivoErrorType: null,
      plivoErrorMessage: null,
    }));

    client.on('onLogin', () => {
      setPlivoState((prev) => ({
        ...prev,
        plivoStatus: PlivoStatusEnum.REGISTERED,
        plivoErrorType: null,
        plivoErrorMessage: null,
        callStatus: PlivoCallStatusEnum.IDLE,
      }));
    });

    client.on('onLoginFailed', (cause: string) => {
      setPlivoState((prev) => ({
        ...prev,
        plivoStatus: PlivoStatusEnum.ERROR,
        plivoErrorType: PlivoErrorTypeEnum.REGISTRATION,
        plivoErrorMessage: cause,
      }));

      // The token has a finite life, so a refused login is most often an
      // expired one rather than a broken integration; ask for a new one before
      // surfacing this as a hard failure.
      onTokenExpiredRef.current();
    });

    client.on('onLogout', () => {
      setPlivoState((prev) => ({
        ...prev,
        plivoStatus: PlivoStatusEnum.DISCONNECTED,
        callStatus: PlivoCallStatusEnum.IDLE,
        callDirection: null,
      }));
    });

    client.on('onCalling', () => {
      setPlivoState((prev) => ({
        ...prev,
        callDirection: PlivoCallDirectionEnum.OUTGOING,
        callStatus: PlivoCallStatusEnum.STARTING,
      }));
    });

    client.on('onCallRemoteRinging', () => {
      setPlivoState((prev) => ({
        ...prev,
        callStatus: PlivoCallStatusEnum.RINGING,
      }));
    });

    client.on(
      'onIncomingCall',
      (
        callerId: string,
        _extraHeaders: Record<string, string>,
        callInfo: { callUUID?: string },
        callerName?: string,
      ) => {
        setPlivoState((prev) => ({
          ...prev,
          callDirection: PlivoCallDirectionEnum.INCOMING,
          callStatus: PlivoCallStatusEnum.STARTING,
          callCounterpart: extractCounterpart(callerId),
          callerName: callerName || null,
          callId: callInfo?.callUUID || null,
        }));
      },
    );

    client.on('onIncomingCallCanceled', () => {
      toast({ title: t('plivo-missed-call'), variant: 'destructive' });
      resetCallState();
    });

    client.on('onCallAnswered', (callInfo: { callUUID?: string }) => {
      setPlivoState((prev) => ({
        ...prev,
        callStatus: PlivoCallStatusEnum.ACTIVE,
        callId: callInfo?.callUUID || prev.callId,
      }));
      playRemoteAudio();
    });

    client.on('onMediaConnected', () => {
      playRemoteAudio();
    });

    client.on(
      'onCallTerminated',
      (_hangupInfo: { originator?: string }, _callInfo: unknown) => {
        setCallNumber('');
        resetCallState();
      },
    );

    client.on('onCallFailed', (cause: string) => {
      toast({
        title: t('plivo-call-failed'),
        description: cause,
        variant: 'destructive',
      });
      resetCallState();
    });

    /**
     * Fires only when the browser answers the microphone prompt.
     *
     * A denial is terminal for calling, so it is raised as a connection-level
     * error rather than being logged — with `permOnClick` the agent hits it on
     * their first call attempt and needs to be told why nothing happened.
     */
    client.on(
      'onMediaPermission',
      (event: { status?: string; error?: string }) => {
        if (event?.status === 'success') return;

        setPlivoState((prev) => ({
          ...prev,
          plivoErrorType: PlivoErrorTypeEnum.MEDIA_PERMISSION,
          plivoErrorMessage: event?.error || t('plivo-mic-denied'),
        }));

        toast({
          title: t('plivo-mic-denied'),
          variant: 'destructive',
        });
      },
    );

    /**
     * Quality warnings, Chrome only.
     *
     * `active: true` means the metric has degraded and a later event with
     * `active: false` means it recovered, so the level is toggled rather than
     * recomputed from raw jitter/MOS values.
     */
    client.on('mediaMetrics', (metric: IPlivoMediaMetric) => {
      setPlivoState((prev) => ({
        ...prev,
        callQuality: metric?.active
          ? PlivoCallQualityEnum.DEGRADED
          : PlivoCallQualityEnum.GOOD,
      }));
    });

    client.on('onConnectionChange', (info: { state?: string }) => {
      if (info?.state === 'disconnected') {
        setPlivoState((prev) => ({
          ...prev,
          plivoStatus: PlivoStatusEnum.ERROR,
          plivoErrorType: PlivoErrorTypeEnum.CONNECTION,
          plivoErrorMessage: t('plivo-connection-lost'),
        }));
      }
    });

    if (!isUnregisteredRef.current) {
      client.loginWithAccessToken(accessToken);
    }

    return () => {
      if (audioRetryRef.current) {
        clearTimeout(audioRetryRef.current);
        audioRetryRef.current = null;
      }

      // Drop every handler this effect attached.
      //
      // logout() ends the SIP session but leaves the listeners on the client's
      // EventEmitter. The SDK does not hand out a fresh emitter per instance,
      // so a remount stacks another full set on top of the old ones: the
      // browser reports "11 onLogin listeners added" and each event then runs
      // its handler once per past mount, driving that many state updates for a
      // single call. removeAllListeners is used rather than tracking each
      // handler because every listener on this client belongs to this effect.
      client.removeAllListeners?.();

      client.logout();
      clientRef.current = null;

      remoteAudioRef.current?.parentNode?.removeChild(remoteAudioRef.current);
      remoteAudioRef.current = null;
    };
    // Re-running on anything but the token would tear down a live call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const startCall = useCallback(
    (destination: string) => {
      if (!destination || !clientRef.current) return;

      if (plivoStateRef.current.callStatus !== PlivoCallStatusEnum.IDLE) return;

      // Second argument is required by the SDK's signature; no custom SIP
      // headers are sent, and any that were would have to start with `X-PH`.
      clientRef.current.call(destination, {});

      setPlivoState((prev) => ({
        ...prev,
        callDirection: PlivoCallDirectionEnum.OUTGOING,
        callStatus: PlivoCallStatusEnum.STARTING,
        callCounterpart: destination,
      }));
    },
    [setPlivoState],
  );

  const answerCall = useCallback(() => {
    const callId = plivoStateRef.current.callId;
    if (!clientRef.current || !callId) return;

    clientRef.current.answer(callId, 'reject');
  }, []);

  const rejectCall = useCallback(() => {
    const callId = plivoStateRef.current.callId;
    if (!clientRef.current || !callId) return;

    clientRef.current.reject(callId);
    resetCallState();
  }, [resetCallState]);

  const stopCall = useCallback(() => {
    clientRef.current?.hangup();
    resetCallState();
  }, [resetCallState]);

  const mute = useCallback(() => {
    if (!clientRef.current) return;

    clientRef.current.mute();
    setPlivoState((prev) => ({ ...prev, isMuted: true }));
  }, [setPlivoState]);

  const unmute = useCallback(() => {
    if (!clientRef.current) return;

    clientRef.current.unmute();
    setPlivoState((prev) => ({ ...prev, isMuted: false }));
  }, [setPlivoState]);

  const sendDtmf = useCallback((digit: string) => {
    clientRef.current?.sendDtmf(digit);
  }, []);

  const unregisterPlivo = useCallback(() => {
    clientRef.current?.logout();
    setIsUnregistered(true);
  }, [setIsUnregistered]);

  const reconnectPlivo = useCallback(() => {
    setIsUnregistered(false);

    if (!clientRef.current) return;

    setPlivoState((prev) => ({
      ...prev,
      plivoStatus: PlivoStatusEnum.CONNECTING,
      plivoErrorType: null,
      plivoErrorMessage: null,
    }));

    clientRef.current.loginWithAccessToken(accessToken);
  }, [accessToken, setIsUnregistered, setPlivoState]);

  const contextValue = useMemo<PlivoContextValue>(
    () => ({
      reconnectPlivo,
      unregisterPlivo,
      answerCall,
      rejectCall,
      startCall,
      stopCall,
      mute,
      unmute,
      sendDtmf,
      phoneNumber,
    }),
    [
      reconnectPlivo,
      unregisterPlivo,
      answerCall,
      rejectCall,
      startCall,
      stopCall,
      mute,
      unmute,
      sendDtmf,
      phoneNumber,
    ],
  );

  return (
    <PlivoContext.Provider value={contextValue}>
      {children}
    </PlivoContext.Provider>
  );
};

export const usePlivo = () => {
  const context = useContext(PlivoContext);

  if (!context) {
    throw new Error('usePlivo must be used within a PlivoProvider');
  }

  return context;
};
