import * as jwt from 'jsonwebtoken';
import {
  PLIVO_ACCESS_TOKEN_TTL_SECONDS,
  PLIVO_ENDPOINT_DOMAIN,
} from '@/integrations/plivo/constants';

/**
 * Claims of a Plivo access token, as the browser SDK's `loginWithAccessToken`
 * expects them.
 *
 * The token is signed with the account's auth token as the HMAC key, so Plivo
 * verifies it without the auth token ever reaching the browser — which is the
 * whole point of using JWT auth instead of shipping SIP endpoint credentials
 * into client-side JavaScript.
 * https://www.plivo.com/docs/voice/concepts/access-token
 */
interface IPlivoAccessTokenClaims {
  /** Account auth id. */
  iss: string;
  /** SIP endpoint username the token logs in as. */
  sub: string;
  /** Plivo application id the endpoint is attached to. */
  app?: string;
  nbf: number;
  exp: number;
  per: {
    voice: {
      incoming_allow: boolean;
      outgoing_allow: boolean;
    };
  };
}

export interface IPlivoAccessToken {
  token: string;
  /** SIP endpoint username the token authenticates, echoed for the client. */
  username: string;
  /** Unix seconds at which the token stops being accepted. */
  expiresAt: number;
  /** Endpoint URI an inbound `<Dial><User>` must target to ring this browser. */
  endpointUri: string;
}

/**
 * Mints a short-lived Plivo access token for one agent's browser softphone.
 *
 * `nbf` is backdated by a minute so a browser clock running slightly ahead of
 * ours does not reject a token that is otherwise valid — Plivo enforces `nbf`
 * strictly, and a few seconds of drift is common enough to break logins.
 *
 * Plivo caps the lifetime at 24 hours and requires at least 3 minutes; the
 * default here is deliberately short because the client re-fetches a token on
 * every mount and a leaked token is only useful until it expires.
 *
 * @param authId - account auth id, becomes `iss`
 * @param authToken - account auth token, used ONLY as the signing key; it is
 *   never part of the payload and must never be returned to the caller
 * @param username - SIP endpoint username, becomes `sub`
 */
export const generatePlivoAccessToken = ({
  authId,
  authToken,
  username,
  appId,
  ttlSeconds = PLIVO_ACCESS_TOKEN_TTL_SECONDS,
}: {
  authId: string;
  authToken: string;
  username: string;
  appId?: string;
  ttlSeconds?: number;
}): IPlivoAccessToken => {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  const claims: IPlivoAccessTokenClaims = {
    iss: authId,
    sub: username,
    nbf: now - 60,
    exp: expiresAt,
    per: {
      voice: {
        incoming_allow: true,
        outgoing_allow: true,
      },
    },
  };

  if (appId) {
    claims.app = appId;
  }

  const token = jwt.sign(claims, authToken, { algorithm: 'HS256' });

  return {
    token,
    username,
    expiresAt,
    endpointUri: `sip:${username}@${PLIVO_ENDPOINT_DOMAIN}`,
  };
};
