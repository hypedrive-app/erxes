import { useEffect, useRef } from 'react';

import {
  isSilentMicSample,
  isSilentSample,
  PLIVO_MEDIA_POLL_MS,
  PLIVO_SILENT_SAMPLES_BEFORE_WARNING,
  samplePlivoMedia,
  TPlivoMediaCounters,
} from '../utils/plivoMediaHealth';

/**
 * Watches a live call for media that never arrives.
 *
 * The SDK reports a call as connected the moment ICE finds a working candidate
 * pair, and never revises that: a network which permits the WebSocket
 * signalling but drops the RTP — a campus or corporate proxy blocking the high
 * UDP range — leaves the agent on a call the UI insists is fine while both
 * sides hear nothing. Nothing in the SDK detects this, so it is polled here.
 *
 * Reports rather than acts. Hanging up automatically would be wrong: the call
 * may be recovering, and an agent who has been told what is happening can
 * decide for themselves. Silence with no explanation is the failure this
 * removes.
 *
 * `onDiagnosis` is also called on the FIRST healthy sample, carrying the ICE
 * candidate types the connection settled on. That is the single most useful
 * fact for diagnosing a later complaint — `relay` means a TURN server was
 * needed, and its absence on a failing network is the whole story — and it is
 * invisible everywhere else.
 */
export const usePlivoMediaHealth = ({
  enabled,
  getPeerConnection,
  onSilent,
  onRecovered,
  onSilentMic,
  onDiagnosis,
}: {
  enabled: boolean;
  getPeerConnection: () => RTCPeerConnection | null;
  onSilent: () => void;
  onRecovered: () => void;
  onSilentMic: () => void;
  onDiagnosis: (detail: {
    localCandidateType?: string;
    remoteCandidateType?: string;
    roundTripTime?: number;
  }) => void;
}) => {
  // Held in refs so changing callbacks cannot restart the interval mid-call,
  // which would reset the silent-sample count and delay the warning forever.
  const onSilentRef = useRef(onSilent);
  const onRecoveredRef = useRef(onRecovered);
  const onSilentMicRef = useRef(onSilentMic);
  const onDiagnosisRef = useRef(onDiagnosis);
  const getPeerConnectionRef = useRef(getPeerConnection);

  onSilentRef.current = onSilent;
  onRecoveredRef.current = onRecovered;
  onSilentMicRef.current = onSilentMic;
  onDiagnosisRef.current = onDiagnosis;
  getPeerConnectionRef.current = getPeerConnection;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let counters: TPlivoMediaCounters = { packetsReceived: 0, packetsSent: 0 };
    let silentSamples = 0;
    let silentMicSamples = 0;
    let warned = false;
    let warnedMic = false;
    let reportedDiagnosis = false;
    let cancelled = false;

    const timer = setInterval(async () => {
      const pc = getPeerConnectionRef.current();

      if (!pc) {
        return;
      }

      try {
        const { sample, counters: next } = await samplePlivoMedia(pc, counters);

        if (cancelled) {
          return;
        }

        counters = next;

        // The very first sample has nothing to diff against — every counter
        // reads as its own delta — so it seeds the baseline and is not judged.
        if (!reportedDiagnosis) {
          reportedDiagnosis = true;

          if (sample.localCandidateType) {
            onDiagnosisRef.current({
              localCandidateType: sample.localCandidateType,
              remoteCandidateType: sample.remoteCandidateType,
              roundTripTime: sample.roundTripTime,
            });
          }

          return;
        }

        if (isSilentSample(sample)) {
          silentSamples += 1;

          if (silentSamples >= PLIVO_SILENT_SAMPLES_BEFORE_WARNING && !warned) {
            warned = true;
            onSilentRef.current();
          }

          return;
        }

        // Media came back. Clearing the warning matters as much as raising it:
        // a call that recovers should stop telling the agent it is broken.
        silentSamples = 0;

        if (warned) {
          warned = false;
          onRecoveredRef.current();
        }

        // Only checked once media is flowing, so a blocked network is never
        // reported as a microphone fault. Warned once per call: a mic that is
        // muted stays muted, and repeating the toast every six seconds would
        // be noise rather than help.
        if (isSilentMicSample(sample)) {
          silentMicSamples += 1;

          if (
            silentMicSamples >= PLIVO_SILENT_SAMPLES_BEFORE_WARNING &&
            !warnedMic
          ) {
            warnedMic = true;
            onSilentMicRef.current();
          }
        } else {
          silentMicSamples = 0;
        }
      } catch {
        // getStats() rejects once the connection is closing, which is the
        // normal end of every call rather than a fault worth reporting.
      }
    }, PLIVO_MEDIA_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);
};
