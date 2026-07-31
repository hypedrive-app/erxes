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

/**
 * The id of the `<audio>` element the SDK creates for the remote stream.
 *
 * Exported as `REMOTE_VIEW_ID` from the package's own constants and used in its
 * `setupRemoteView()`; it is not part of the public API, so every read of it is
 * guarded against the element being absent.
 */
const PLIVO_REMOTE_VIEW_ID = 'plivo_webrtc_remoteview';

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
  const audioRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read inside SDK callbacks, which are registered once and would otherwise
  // close over the state as it was at login time.
  const plivoStateRef = useRef(plivoState);
  const onTokenExpiredRef = useRef(onTokenExpired);
  const isUnregisteredRef = useRef(isUnregistered);
  // The SDK handlers are attached once per token, so a `t` captured there would
  // keep rendering the language that was active at login even after the agent
  // switches it.
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
   * Nudges the remote stream through the autoplay policy.
   *
   * The element is the SDK's OWN `#plivo_webrtc_remoteview`, which it creates in
   * `setupRemoteView()` and is the only element it ever assigns
   * `remoteView.srcObject` to. This provider used to create and play its own
   * `<audio id="plivo-provider-audio">`, which no stream was ever attached to:
   * playing an empty element always resolves, so the retry never fired on a
   * genuinely silent call, and when it did fire it reported "audio blocked" for
   * a call whose audio was in fact fine. Looking the element up by the SDK's id
   * is undocumented, so a miss is treated as "nothing to do" rather than as an
   * error — the SDK's own autoplay handling still applies.
   */
  const playRemoteAudio = useCallback(() => {
    const element = document.getElementById(
      PLIVO_REMOTE_VIEW_ID,
    ) as HTMLAudioElement | null;

    if (!element) return;

    // `onCallAnswered` and `onMediaConnected` both call this, so a pending retry
    // from the first would otherwise still be armed and could raise a spurious
    // "audio blocked" against a call whose audio is already playing.
    if (audioRetryRef.current) {
      clearTimeout(audioRetryRef.current);
      audioRetryRef.current = null;
    }

    const attempt = element.play();
    if (!attempt) return;

    attempt.catch(() => {
      audioRetryRef.current = setTimeout(() => {
        const retryElement = document.getElementById(
          PLIVO_REMOTE_VIEW_ID,
        ) as HTMLAudioElement | null;

        retryElement?.play().catch(() => {
          setPlivoState((prev) => ({
            ...prev,
            plivoErrorType: PlivoErrorTypeEnum.AUDIO_PLAYBACK,
            plivoErrorMessage: tRef.current('plivo-audio-blocked'),
          }));
          toast({
            title: tRef.current('plivo-audio-blocked'),
            variant: 'warning',
          });
        });
      }, 2000);
    });
  }, [setPlivoState]);

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
      // Audio faults belong to the call that raised them. Left set, a single
      // blocked-autoplay call would keep the destructive banner on the in-call
      // surface, and the mic-denied badge on the status row, for every later
      // call in the session — including ones with working audio. Connection and
      // registration faults are NOT cleared here: those outlive the call.
      ...(prev.plivoErrorType === PlivoErrorTypeEnum.AUDIO_PLAYBACK ||
      prev.plivoErrorType === PlivoErrorTypeEnum.MEDIA_PERMISSION
        ? { plivoErrorType: null, plivoErrorMessage: null }
        : {}),
    }));
  }, [setPlivoState]);

  // The client is created once per token. Every handler is attached here
  // because the SDK has no way to replace a listener after login.
  useEffect(() => {
    if (!accessToken) return;

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

    /**
     * Also the SDK's expiry signal.
     *
     * A plain `loginWithAccessToken` does not refresh itself: when the token
     * dies the SDK emits `onLogout` with the cause `ACCESS_TOKEN_EXPIRED` and
     * then logs out. Treating that like a deliberate sign-out left the agent
     * silently offline mid-shift — the launcher went red and no call could
     * arrive, with nothing saying why. A fresh token is requested instead,
     * which remounts this effect and logs back in.
     */
    client.on('onLogout', (cause?: string) => {
      if (cause === 'ACCESS_TOKEN_EXPIRED') {
        setPlivoState((prev) => ({
          ...prev,
          plivoStatus: PlivoStatusEnum.CONNECTING,
          callStatus: PlivoCallStatusEnum.IDLE,
          callDirection: null,
        }));

        onTokenExpiredRef.current();
        return;
      }

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
      toast({ title: tRef.current('plivo-missed-call'), variant: 'destructive' });
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

    /**
     * Both ends of a normal hangup.
     *
     * `originator` is `'local'` or `'remote'`, but the teardown is identical
     * either way and the agent watched the call end in front of them, so it is
     * not surfaced: a toast saying the other side hung up would fire on every
     * ordinary completed call. It is NOT safe to call `hangup()` from here —
     * the SDK raises INVALID_STATE_ERROR for a session it is already tearing
     * down — which is why this only resets local state.
     */
    client.on('onCallTerminated', () => {
      setCallNumber('');
      resetCallState();
    });

    client.on('onCallFailed', (cause: string) => {
      toast({
        title: tRef.current('plivo-call-failed'),
        description: cause,
        variant: 'destructive',
      });
      // A failed call left the number on the dialpad while a terminated one
      // cleared it, so the next call started from a half-filled field
      // depending only on how the previous one happened to end.
      setCallNumber('');
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
          plivoErrorMessage: event?.error || tRef.current('plivo-mic-denied'),
        }));

        toast({
          title: tRef.current('plivo-mic-denied'),
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
          plivoErrorMessage: tRef.current('plivo-connection-lost'),
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

      // Teardown order matters: end the media session, then the SIP session,
      // then the handlers.
      //
      // A token refresh re-runs this effect while a call can still be up, and
      // `logout()` alone drops that call's audio without releasing the session
      // — leaving the far end connected to nothing. `hangup()` is a no-op when
      // there is no current session, so it is safe unconditionally.
      client.hangup();
      client.logout();

      // logout() ends the SIP session but leaves the listeners on the client's
      // EventEmitter. The SDK does not hand out a fresh emitter per instance,
      // so a remount stacks another full set on top of the old ones: the
      // browser reports "11 onLogin listeners added" and each event then runs
      // its handler once per past mount, driving that many state updates for a
      // single call. removeAllListeners is used rather than tracking each
      // handler because every listener on this client belongs to this effect.
      // It runs LAST so the two calls above can still report through it.
      client.removeAllListeners?.();

      clientRef.current = null;
    };
    // Re-running on anything but the token would tear down a live call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const startCall = useCallback(
    (destination: string) => {
      if (!destination || !clientRef.current) return;

      if (plivoStateRef.current.callStatus !== PlivoCallStatusEnum.IDLE) return;

      // `plivoStateRef` is synced by an effect, which does not run until after
      // the click handler returns — so two clicks in the same tick both read
      // IDLE and both reach `call()`, placing two calls. Marking the ref
      // immediately closes that window; the SDK has no idempotent dial.
      plivoStateRef.current = {
        ...plivoStateRef.current,
        callStatus: PlivoCallStatusEnum.STARTING,
      };

      // Second argument is required by the SDK's signature; no custom SIP
      // headers are sent, and any that were would have to start with `X-PH`.
      //
      // `call()` NEVER throws. When the client is not registered it logs a
      // warning and returns false, so without checking the result the UI would
      // move to "Calling..." for a call that was never placed and sit there
      // until the agent gave up — there is no event to bring it back.
      const placed = clientRef.current.call(destination, {});

      if (placed === false) {
        plivoStateRef.current = {
          ...plivoStateRef.current,
          callStatus: PlivoCallStatusEnum.IDLE,
        };

        toast({
          title: tRef.current('plivo-call-failed'),
          description: tRef.current('plivo-not-registered'),
          variant: 'destructive',
        });
        return;
      }

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
    // `onCallTerminated` clears the dialpad, but it does not fire for a call
    // that never connected — so hanging up while it was still ringing left the
    // number behind when every other end-of-call path cleared it.
    setCallNumber('');
    resetCallState();
  }, [resetCallState, setCallNumber]);

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
    // Going offline tears down the SIP session, which drops a live call without
    // ever reporting it. The call is ended explicitly first so the state — and
    // the dialpad — land in the same place they would after a normal hangup,
    // rather than leaving a counterpart and a running timer on a dead call.
    if (plivoStateRef.current.callStatus !== PlivoCallStatusEnum.IDLE) {
      clientRef.current?.hangup();
      setCallNumber('');
      resetCallState();
    }

    clientRef.current?.logout();
    setIsUnregistered(true);
  }, [resetCallState, setCallNumber, setIsUnregistered]);

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
