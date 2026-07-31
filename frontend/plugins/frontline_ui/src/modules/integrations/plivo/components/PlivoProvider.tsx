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
import { trimPlivoLogStorage } from '@/integrations/plivo/utils/plivoLogStorage';

const PlivoContext = createContext<PlivoContextValue | null>(null);

/**
 * Options tuned for a CRM shell rather than a dedicated dialer page.
 *
 * `permOnClick` defers the microphone prompt to the first call — the widget is
 * mounted on every page, and prompting on load would ask an agent who may never
 * place a call. `closeProtection` warns before a tab close drops a live call.
 * `allowMultipleIncomingCalls` is off so a second inbound call cannot arrive
 * mid-conversation, matching how the Grandstream widget replies busy.
 *
 * Quality tracking is OFF. `enableQualityTracking: 'ALL'` is the SDK's most
 * verbose setting — it ships per-stream stats to Plivo's callstats service AND
 * mirrors them into the local log store on every metrics tick. Nobody reads
 * either: the only quality signal this widget acts on is the `mediaMetrics`
 * event, which the SDK emits from the peer connection regardless of this flag,
 * and `appId`/`appSecret` are not configured, so the remote half was never
 * actually reaching Plivo. What it did do was multiply writes to the SDK's
 * unbounded `PlivoLogStorage` key until the origin's localStorage quota was
 * gone — see `trimPlivoLogStorage` for what that broke. Keeping the local
 * bound is still necessary with tracking off, because the SDK logs its INIT,
 * LOGIN and CALLING categories to that key unconditionally.
 */
const PLIVO_OPTIONS = {
  debug: 'ERROR' as const,
  permOnClick: true,
  closeProtection: true,
  enableTracking: false,
  enableQualityTracking: 'NONE' as const,
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
 * How many times a refused login may ask for a fresh credential.
 *
 * The SDK does NOT retry a failed login — `_onRegistrationFailed` emits
 * `onLoginFailed` and stops — so every retry is this provider's own. Refetching
 * changes the password, which is a dependency of the login effect, so each
 * refetch tears the client down and logs in again: unbounded, that is a closed
 * fail → refetch → remount → fail loop that ran roughly every 700ms and grew
 * the SDK's own log store by ~9MB/hour until localStorage was gone.
 *
 * On the password path "retry" means something narrower than it did for a
 * token, and the budget shrinks accordingly. A SIP password does not expire, so
 * a refetch can no longer fix the common case it was written for. What it CAN
 * fix is exactly one thing: our stored password having drifted from the
 * endpoint that actually exists at Plivo — the endpoint deleted and
 * re-provisioned in the console, or a row left over from a previous
 * integration. The server's `ensurePlivoEndpoint` reconciles that on every
 * fetch, rotating when it holds no usable password.
 *
 * ONE such attempt is all that is justified. If the refetch reconciled
 * anything, the very next login succeeds; if it did not, the server returned
 * the same password it just returned, and asking a third time cannot produce a
 * different one. A second attempt would only re-POST a rotation Plivo already
 * accepted.
 */
const PLIVO_MAX_LOGIN_CREDENTIAL_ATTEMPTS = 1;

/**
 * How many times a transient failure may re-login with the SAME credential.
 *
 * A laptop resuming from sleep or a flaky network raises `Connection Error` /
 * `Request Timeout` against a credential that is perfectly valid, so treating
 * those as terminal would strand an agent offline until they noticed and
 * pressed Reconnect. These retries deliberately do NOT refetch — they re-drive
 * the existing username/password through `login`, which leaves both untouched
 * and so cannot re-enter the remount loop the counter above exists to stop.
 */
const PLIVO_MAX_LOGIN_BACKOFF_ATTEMPTS = 3;

/** 2s, 4s, 8s. Indexed by the retry that is about to be scheduled. */
const PLIVO_LOGIN_BACKOFF_MS = [2000, 4000, 8000];

/**
 * Causes that no retry can clear, so they are surfaced immediately.
 *
 * These are additions to the attempt counter, never a replacement for it: the
 * SDK reports most registrar rejections as the generic `SIP Failure Code`, so
 * matching on cause alone would leave the loop wide open for everything not
 * listed here.
 *
 * `Authentication Error` was on this list under JWT auth and is deliberately
 * NOT here now. On the password path it is the single most repairable cause:
 * it is exactly what Plivo answers when the password we hold has drifted from
 * the endpoint's real one, which is what a refetch reconciles. It therefore
 * falls through to the counted path below and gets its one credential attempt.
 *
 * `Not Found` means the registrar has no such endpoint. A refetch DOES fix that
 * — `ensurePlivoEndpoint` creates one when the alias lookup misses — so it is
 * likewise left to the counted path rather than declared terminal here.
 */
const PLIVO_PERMANENT_LOGIN_CAUSES = new Set([
  'Origin Not Allowed',
  'Forbidden',
]);

/** Causes that are worth retrying with the token already in hand. */
const PLIVO_TRANSIENT_LOGIN_CAUSES = new Set([
  'Connection Error',
  'Request Timeout',
  'Cannot login when there is no internet',
]);

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
  username,
  password,
  phoneNumber,
  onCredentialsRejected,
  children,
}: {
  /** SIP endpoint username, as Plivo assigned it. */
  username: string;
  /** SIP password for that endpoint. Never logged, never rendered. */
  password: string;
  phoneNumber?: string | null;
  /**
   * Asks the container to re-issue credentials when Plivo refuses this login
   * for a reason re-provisioning could repair.
   */
  onCredentialsRejected: () => void;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const [plivoState, setPlivoState] = useAtom(plivoStateAtom);
  const setCallNumber = useSetAtom(plivoNumberAtom);
  const [isUnregistered, setIsUnregistered] = useAtom(plivoUnregisteredAtom);

  const clientRef = useRef<Client | null>(null);
  const audioRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Both counters are refs rather than state: they are read and written from
  // SDK callbacks that were registered once at login and would close over a
  // stale value, and a re-render on every failed attempt would change nothing
  // that is rendered.
  const loginAttemptsRef = useRef(0);
  const loginBackoffAttemptsRef = useRef(0);
  const loginBackoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read inside SDK callbacks, which are registered once and would otherwise
  // close over the state as it was at login time.
  const plivoStateRef = useRef(plivoState);
  const onCredentialsRejectedRef = useRef(onCredentialsRejected);
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
    onCredentialsRejectedRef.current = onCredentialsRejected;
  }, [onCredentialsRejected]);

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

  // The client is created once per credential. Every handler is attached here
  // because the SDK has no way to replace a listener after login.
  useEffect(() => {
    if (!username || !password) return;

    // Runs BEFORE the client is constructed, because the SDK logs its INIT
    // category from the constructor and its LOGIN category from
    // `login` — both through the unguarded `setItem` that a full
    // quota throws on. On an agent whose storage is already saturated (which is
    // every agent who has run the previous build) this is what makes the very
    // next page load recover: the key is cut back under budget here, so both
    // the SDK's login and every unrelated feature's writes have room again.
    trimPlivoLogStorage();

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
      // A login that succeeded proves the credential and the endpoint are both
      // good, so the next failure starts from a clean budget rather than
      // inheriting one spent on an unrelated earlier fault — an agent whose
      // network dropped twice hours ago must not be one failure away from
      // terminal.
      loginAttemptsRef.current = 0;
      loginBackoffAttemptsRef.current = 0;

      setPlivoState((prev) => ({
        ...prev,
        plivoStatus: PlivoStatusEnum.REGISTERED,
        plivoErrorType: null,
        plivoErrorMessage: null,
        callStatus: PlivoCallStatusEnum.IDLE,
      }));
    });

    /**
     * Every path out of here is bounded.
     *
     * The SDK stops dead on a refused login, so whatever this handler does is
     * the whole retry policy. It used to unconditionally ask for a new
     * credential, which changed the effect's dependency and remounted the
     * client into the same failure — a hot loop that hammered our own endpoint
     * and Plivo's registrar several times a second and showed the agent nothing
     * but a red launcher. There are exactly three outcomes, and two of them
     * count down to the third.
     */
    client.on('onLoginFailed', (cause: string) => {
      const failTerminally = (message: string) => {
        setPlivoState((prev) => ({
          ...prev,
          plivoStatus: PlivoStatusEnum.ERROR,
          plivoErrorType: PlivoErrorTypeEnum.REGISTRATION,
          // The raw cause is kept alongside the guidance because it is the only
          // thing that distinguishes an account-level fault from a token one
          // when an agent reports this.
          plivoErrorMessage: `${message} (${cause})`,
        }));
      };

      // A transient cause means the credential was never in question, so it is
      // retried with the one already in hand — no refetch, so `password` does
      // not change and the effect does not remount.
      if (PLIVO_TRANSIENT_LOGIN_CAUSES.has(cause)) {
        if (loginBackoffAttemptsRef.current >= PLIVO_MAX_LOGIN_BACKOFF_ATTEMPTS) {
          failTerminally(tRef.current('plivo-login-unreachable'));
          return;
        }

        const delay = PLIVO_LOGIN_BACKOFF_MS[loginBackoffAttemptsRef.current];
        loginBackoffAttemptsRef.current += 1;

        setPlivoState((prev) => ({
          ...prev,
          plivoStatus: PlivoStatusEnum.CONNECTING,
          plivoErrorType: PlivoErrorTypeEnum.CONNECTION,
          plivoErrorMessage: tRef.current('plivo-login-retrying'),
        }));

        // Only one retry is ever armed: a second failure cannot arrive before
        // this fires, because the SDK raises `onLoginFailed` once per attempt.
        // Cleared on unmount so a token refresh or a page change cannot leave a
        // timer pointing at a client that has already been torn down.
        if (loginBackoffRef.current) clearTimeout(loginBackoffRef.current);

        loginBackoffRef.current = setTimeout(() => {
          loginBackoffRef.current = null;
          if (clientRef.current !== client) return;
          if (isUnregisteredRef.current) return;

          // `login` returns false synchronously when the SDK refuses to even
          // attempt — no `onLoginFailed` follows it, so a bare call would leave
          // the widget stuck on "Reconnecting..." with nothing further coming.
          if (client.login(username, password) === false) {
            failTerminally(tRef.current('plivo-login-unreachable'));
          }
        }, delay);
        return;
      }

      // Known-permanent causes skip the budget entirely — a new credential
      // cannot fix an origin the account refuses — but they never replace it,
      // because the SDK reports most registrar rejections as a generic `SIP
      // Failure Code` that lands below in the counted path.
      if (PLIVO_PERMANENT_LOGIN_CAUSES.has(cause)) {
        failTerminally(tRef.current('plivo-login-rejected'));
        return;
      }

      // Everything else — `Authentication Error`, `Not Found`, and the generic
      // `SIP Failure Code` an unprovisioned or out-of-credit account produces —
      // is treated as a credential that may have drifted from the endpoint,
      // and re-issued a strictly counted number of times. This is the
      // load-bearing guard: it is the only thing standing between the ambiguous
      // causes and the old hot loop.
      if (loginAttemptsRef.current >= PLIVO_MAX_LOGIN_CREDENTIAL_ATTEMPTS) {
        failTerminally(tRef.current('plivo-login-failed-permanently'));
        return;
      }

      loginAttemptsRef.current += 1;

      setPlivoState((prev) => ({
        ...prev,
        plivoStatus: PlivoStatusEnum.CONNECTING,
        plivoErrorType: PlivoErrorTypeEnum.REGISTRATION,
        plivoErrorMessage: tRef.current('plivo-login-retrying'),
      }));

      onCredentialsRejectedRef.current();
    });

    /**
     * A password registration has no expiry, so this is now only ever a real
     * sign-out.
     *
     * Under JWT auth the SDK emitted `ACCESS_TOKEN_EXPIRED` here when the token
     * died mid-shift, and that branch requested a fresh one. A SIP password
     * does not expire and the SDK re-registers on its own for the life of the
     * session, so the cause can no longer arrive and the branch was removed
     * rather than left as a condition nothing satisfies.
     */
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

    // `login` reports a refusal it will not raise an event for by returning
    // false — an empty credential, or a client the SDK considers already busy.
    // Without checking it the widget would sit on "Connecting..." forever,
    // because no `onLoginFailed` follows a synchronous false.
    if (!isUnregisteredRef.current) {
      if (client.login(username, password) === false) {
        setPlivoState((prev) => ({
          ...prev,
          plivoStatus: PlivoStatusEnum.ERROR,
          plivoErrorType: PlivoErrorTypeEnum.REGISTRATION,
          plivoErrorMessage: tRef.current('plivo-login-rejected'),
        }));
      }
    }

    // The trim above only bounds the log as it stood at login. The SDK keeps
    // appending for the whole session — a CALLING line per call, plus WS and
    // NETWORK_CHANGE lines — so an agent who leaves the CRM open for a shift
    // would drift back over budget and re-break other features without ever
    // reloading. Re-checking on an interval keeps the ceiling in force for as
    // long as the client is mounted; the check is a single `getItem` and a
    // length compare, and only rewrites when it is actually over.
    const trimInterval = setInterval(trimPlivoLogStorage, 5 * 60 * 1000);

    return () => {
      clearInterval(trimInterval);

      if (audioRetryRef.current) {
        clearTimeout(audioRetryRef.current);
        audioRetryRef.current = null;
      }

      // A pending login retry holds the client this effect created. Left armed,
      // it would fire against a client that has already been logged out and had
      // its listeners removed — so the attempt could neither succeed nor report
      // that it failed, and on a token refresh it would race the new client's
      // own login.
      if (loginBackoffRef.current) {
        clearTimeout(loginBackoffRef.current);
        loginBackoffRef.current = null;
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
    // Re-running on anything but the credential would tear down a live call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, password]);

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

    // An explicit Reconnect is the agent asserting that whatever was wrong has
    // been dealt with, so it earns a full budget back. Without this the button
    // would be dead after a terminal failure — one press, one refused login,
    // straight back to terminal — which is the state it exists to escape. A
    // pending backoff retry is dropped so the manual attempt is the only one
    // in flight.
    loginAttemptsRef.current = 0;
    loginBackoffAttemptsRef.current = 0;

    if (loginBackoffRef.current) {
      clearTimeout(loginBackoffRef.current);
      loginBackoffRef.current = null;
    }

    setPlivoState((prev) => ({
      ...prev,
      plivoStatus: PlivoStatusEnum.CONNECTING,
      plivoErrorType: null,
      plivoErrorMessage: null,
    }));

    // The client already exists here, so the mount-time trim does not re-run —
    // but this is the button an agent presses precisely when login has been
    // failing, and a login that silently returns false on a full quota is one
    // of the reasons it was. Making room again is what lets the retry differ
    // from the attempt that failed.
    trimPlivoLogStorage();

    // A synchronous false raises no event, so the press would otherwise leave
    // the widget on "Connecting..." and look like the button did nothing.
    if (clientRef.current.login(username, password) === false) {
      setPlivoState((prev) => ({
        ...prev,
        plivoStatus: PlivoStatusEnum.ERROR,
        plivoErrorType: PlivoErrorTypeEnum.REGISTRATION,
        plivoErrorMessage: tRef.current('plivo-login-rejected'),
      }));
    }
  }, [username, password, setIsUnregistered, setPlivoState]);

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
