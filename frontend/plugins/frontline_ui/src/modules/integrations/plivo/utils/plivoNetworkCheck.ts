/**
 * Tests whether this network can carry a call, before a customer is on one.
 *
 * WebRTC needs two separate things from a network and they fail independently:
 * the WebSocket signalling on 443, which almost every network permits, and the
 * media itself on high UDP ports, which filtered networks routinely drop. Only
 * the first is exercised by logging in, so an agent can appear perfectly
 * online and still be unable to hold a conversation — which is exactly what a
 * campus proxy produces.
 *
 * This runs the same candidate gathering a real call would, against Plivo's
 * own STUN servers, and reports what came back. It cannot prove media will
 * flow — only a real call does that — but the absence of a server-reflexive
 * candidate is conclusive the other way: if STUN cannot even discover our
 * public address, no call from this network will ever carry audio.
 */

/** Plivo's own STUN servers, as listed in their firewall documentation. */
const PLIVO_STUN_SERVERS = [
  'stun:stun.plivo.com:3478',
  'stun:stun-fb.plivo.com:3478',
];

export type TPlivoNetworkVerdict =
  /** STUN answered: the network permits the UDP a call needs to negotiate. */
  | 'ok'
  /**
   * Only local addresses were found. STUN got no reply, so outbound UDP is
   * filtered and a call will connect but carry no audio.
   */
  | 'blocked'
  /** The browser refused to gather at all — nothing can be concluded. */
  | 'unknown';

export type TPlivoNetworkResult = {
  verdict: TPlivoNetworkVerdict;
  /** Candidate types seen, for the support log: host, srflx, relay. */
  candidateTypes: string[];
  /** How long gathering took, in ms. */
  elapsedMs: number;
};

/** Gathering is abandoned after this; a healthy network answers in well under. */
const GATHER_TIMEOUT_MS = 5000;

/**
 * Runs one round of ICE gathering and reports what the network allowed.
 *
 * Deliberately standalone rather than going through the Plivo SDK: this must
 * be runnable when no call is in progress and without a registered client, and
 * `RTCPeerConnection` is the same primitive the SDK itself uses.
 */
export const checkPlivoNetwork = async (): Promise<TPlivoNetworkResult> => {
  const startedAt = Date.now();
  const candidateTypes = new Set<string>();

  let pc: RTCPeerConnection | null = null;

  try {
    pc = new RTCPeerConnection({
      iceServers: [{ urls: PLIVO_STUN_SERVERS }],
    });

    // A data channel is what gives ICE something to gather FOR. Without either
    // a track or a channel the offer has no media section and no candidates
    // are produced at all, which would read as "blocked" on every network.
    pc.createDataChannel('probe');

    // Bound to a const so the closures below need no non-null assertions:
    // `pc` is nullable for the `finally` block, but is definitely assigned here.
    const connection = pc;

    await new Promise<void>((resolve) => {
      const finish = () => resolve();
      const timer = setTimeout(finish, GATHER_TIMEOUT_MS);

      connection.onicecandidate = (event) => {
        if (!event.candidate) {
          // A null candidate marks the end of gathering.
          clearTimeout(timer);
          finish();
          return;
        }

        const type = event.candidate.type;

        if (type) {
          candidateTypes.add(type);
        }

        // srflx is the whole question: it means a STUN server replied, which
        // means outbound UDP left this network and came back. Nothing later
        // can change that answer, so gathering stops early rather than
        // spending the full timeout.
        if (type === 'srflx' || type === 'relay') {
          clearTimeout(timer);
          finish();
        }
      };

      connection
        .createOffer()
        .then((offer) => connection.setLocalDescription(offer))
        .catch(finish);
    });

    const types = [...candidateTypes];

    return {
      verdict: types.some((type) => type === 'srflx' || type === 'relay')
        ? 'ok'
        : types.length
          ? 'blocked'
          : 'unknown',
      candidateTypes: types,
      elapsedMs: Date.now() - startedAt,
    };
  } catch {
    return {
      verdict: 'unknown',
      candidateTypes: [...candidateTypes],
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    pc?.close();
  }
};
