/**
 * Reads whether audio is actually flowing on a live call.
 *
 * `iceConnectionState` reaching `connected` only means a candidate pair passed
 * its connectivity checks — it says nothing about RTP arriving afterwards. A
 * call on a network that permits the signalling but drops the media (a campus
 * or corporate proxy blocking the high UDP range) sits in `connected`
 * indefinitely while both parties hear silence, which is the worst possible
 * state to leave an agent in: the UI says the call is fine.
 *
 * `getStats()` is the only ground truth for this, so these helpers read it.
 */

/** What the monitor concluded about one sample. */
export type TPlivoMediaSample = {
  /** Packets that arrived since the previous sample. */
  inboundDelta: number;
  /** Packets sent since the previous sample. */
  outboundDelta: number;
  /**
   * Which kind of ICE candidate the connection settled on: `host` (same
   * network), `srflx` (through NAT, discovered via STUN), or `relay` (through
   * a TURN server). The Plivo SDK ships no TURN servers, so `relay` never
   * appears — which is precisely why a network that blocks direct media has no
   * fallback and the call goes silent.
   */
  localCandidateType?: string;
  remoteCandidateType?: string;
  roundTripTime?: number;
  packetsLost?: number;
  /**
   * Loudness of what OUR microphone is capturing, 0..1.
   *
   * Read separately from `outboundDelta` because the two fail differently: a
   * muted or dead microphone still sends packets (silence encodes to
   * something), so the packet count alone cannot tell a working mic from one
   * capturing nothing. `track.enabled` cannot either — it stays true for a
   * mic muted at the operating system.
   */
  outboundAudioLevel?: number;
};

/** Cumulative counters carried between samples, so deltas can be computed. */
export type TPlivoMediaCounters = {
  packetsReceived: number;
  packetsSent: number;
};

const readNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Samples one `getStats()` report.
 *
 * Deltas rather than absolute values: every RTP counter is cumulative for the
 * life of the connection, so a call that received audio and then went silent
 * still reports a large `packetsReceived` forever. Only the change between two
 * samples says whether media is flowing NOW.
 */
export const samplePlivoMedia = async (
  pc: RTCPeerConnection,
  previous: TPlivoMediaCounters,
): Promise<{ sample: TPlivoMediaSample; counters: TPlivoMediaCounters }> => {
  const report = await pc.getStats();

  let packetsReceived = 0;
  let packetsSent = 0;
  let packetsLost = 0;
  let roundTripTime: number | undefined;
  let localCandidateType: string | undefined;
  let remoteCandidateType: string | undefined;
  let outboundAudioLevel: number | undefined;

  // Candidate ids are resolved against the same report rather than a second
  // call: `getStats()` returns one consistent snapshot, and looking them up
  // later could read a pair that has since been replaced.
  const byId = new Map<string, Record<string, unknown>>();

  report.forEach((entry) => {
    byId.set(String((entry as { id?: string }).id || ''), entry as never);
  });

  report.forEach((entry) => {
    const stat = entry as Record<string, unknown>;
    const type = String(stat.type || '');

    if (type === 'inbound-rtp' && stat.kind === 'audio') {
      packetsReceived += readNumber(stat.packetsReceived);
      packetsLost += readNumber(stat.packetsLost);
    }

    if (type === 'outbound-rtp' && stat.kind === 'audio') {
      packetsSent += readNumber(stat.packetsSent);
    }

    // Chrome reports the captured level on `media-source`; older
    // implementations put it on the outbound track stats. Both are read so the
    // check does not silently do nothing on one of them.
    if (
      (type === 'media-source' || type === 'track') &&
      stat.kind === 'audio' &&
      stat.audioLevel !== undefined
    ) {
      outboundAudioLevel = readNumber(stat.audioLevel);
    }

    // `selected` is Firefox's spelling; Chrome marks the pair nominated and
    // succeeded instead, so both are accepted rather than picking one browser.
    const isSelectedPair =
      type === 'candidate-pair' &&
      (stat.selected === true ||
        (stat.nominated === true && stat.state === 'succeeded'));

    if (isSelectedPair) {
      roundTripTime = readNumber(stat.currentRoundTripTime) || undefined;

      const local = byId.get(String(stat.localCandidateId || ''));
      const remote = byId.get(String(stat.remoteCandidateId || ''));

      localCandidateType = local
        ? String(local.candidateType || '')
        : undefined;
      remoteCandidateType = remote
        ? String(remote.candidateType || '')
        : undefined;
    }
  });

  return {
    sample: {
      inboundDelta: packetsReceived - previous.packetsReceived,
      outboundDelta: packetsSent - previous.packetsSent,
      localCandidateType,
      remoteCandidateType,
      roundTripTime,
      packetsLost,
      outboundAudioLevel,
    },
    counters: { packetsReceived, packetsSent },
  };
};

/**
 * How many consecutive silent samples before the agent is told.
 *
 * Three, at the two second interval below, means roughly six seconds of no
 * audio at all. Long enough that a slow start or a momentary blip does not
 * raise a false alarm, short enough that an agent is not left talking into a
 * dead line for half a minute.
 */
export const PLIVO_SILENT_SAMPLES_BEFORE_WARNING = 3;

/** Poll interval. Two seconds keeps the check cheap while staying responsive. */
export const PLIVO_MEDIA_POLL_MS = 2000;

/**
 * Whether a sample shows no media in EITHER direction.
 *
 * Both directions, not one: a call where only inbound is dead is a genuine
 * one-way-audio fault worth reporting differently, while both being dead is
 * the blocked-media case this exists to catch. `outboundDelta` is included so
 * a muted microphone — which legitimately sends near-nothing — is not
 * mistaken for a network failure by the inbound half alone.
 */
export const isSilentSample = (sample: TPlivoMediaSample): boolean =>
  sample.inboundDelta <= 0 && sample.outboundDelta <= 0;

/**
 * The level below which a microphone is capturing nothing at all.
 *
 * Not zero: a live microphone in a silent room still reports a tiny non-zero
 * level from its own noise floor, so an exact-zero test would miss the case
 * this exists to catch — a muted or broken device — while a small threshold
 * catches it and still clears the moment anybody speaks.
 */
const SILENT_MIC_LEVEL = 0.0001;

/**
 * Whether our own microphone is producing silence while the call is otherwise
 * healthy.
 *
 * Deliberately requires media to be flowing: if nothing is flowing at all, the
 * network is the story and reporting a mic fault on top of it would send the
 * agent to check the wrong thing.
 */
export const isSilentMicSample = (sample: TPlivoMediaSample): boolean =>
  sample.outboundDelta > 0 &&
  sample.outboundAudioLevel !== undefined &&
  sample.outboundAudioLevel < SILENT_MIC_LEVEL;
