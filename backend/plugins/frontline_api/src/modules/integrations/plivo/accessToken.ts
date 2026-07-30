import * as jwt from 'jsonwebtoken';
import {
  PLIVO_ACCESS_TOKEN_CLOCK_SKEW_SECONDS,
  PLIVO_ACCESS_TOKEN_MAX_TTL_SECONDS,
  PLIVO_ACCESS_TOKEN_MIN_TTL_SECONDS,
  PLIVO_ACCESS_TOKEN_TTL_SECONDS,
  PLIVO_ENDPOINT_DOMAIN,
} from '@/integrations/plivo/constants';

/** Voice permissions, in the shape both claim names carry. */
interface IPlivoVoiceGrants {
  voice: {
    incoming_allow: boolean;
    outgoing_allow: boolean;
  };
}

/**
 * Claims of a Plivo access token.
 *
 * The token is signed locally with the account's auth token as the HMAC key,
 * exactly as Plivo's own server SDKs do (`plivo-node` `lib/utils/jwt.js`
 * `AccessToken.toJwt()`, `plivo-python` `plivo/utils/jwt.py`), so the auth token
 * never reaches the browser — the whole point of JWT auth over shipping SIP
 * endpoint credentials into client-side JavaScript.
 *
 * Permissions are emitted under BOTH names on purpose. Plivo's server SDKs put
 * them in `grants`, which is what Plivo's SIP registrar validates when the
 * browser registers with the token in the `X-Plivo-Jwt` header. The browser SDK
 * reads `per.voice` instead (`_initJWTParams` in `Plivo-Browser-SDK-v2`
 * `lib/client.ts`) to decide locally whether to allow incoming/outgoing calls;
 * with `per` missing it leaves both grant flags `undefined` and silently blocks
 * calls. Only carrying both satisfies both consumers.
 * https://www.plivo.com/docs/voice/sdk/browser/jwt-authentication
 */
interface IPlivoAccessTokenClaims {
  /** Unique token id; Plivo's SDKs always set one. */
  jti: string;
  /** Account auth id. */
  iss: string;
  /** SIP endpoint username the token logs in as. */
  sub: string;
  /** Plivo application id the endpoint is attached to. */
  app?: string;
  nbf: number;
  exp: number;
  /** Read by Plivo's SIP registrar; the name used by Plivo's server SDKs. */
  grants: IPlivoVoiceGrants;
  /** Read by the browser SDK to gate incoming/outgoing calls client-side. */
  per: IPlivoVoiceGrants;
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
 * The lifetime is measured from `nbf`, not from now: Plivo derives validity as
 * `exp - nbf`, so backdating `nbf` to absorb clock drift would eat into the
 * allowed range and can push a token past the 24 hour ceiling. `nbf` is
 * therefore left at the current second and the drift allowance is expressed as
 * a skew subtracted from `nbf` only after the lifetime has been clamped.
 *
 * @param authId - account auth id, becomes `iss`
 * @param authToken - account auth token, used ONLY as the signing key; it is
 *   never part of the payload and must never be returned to the caller
 * @param username - SIP endpoint username, becomes `sub`; a Plivo SIP endpoint
 *   with this username must already exist, otherwise registration fails
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
  // Plivo rejects a lifetime outside [180, 86400] seconds; clamping here means a
  // misconfigured TTL yields a shorter-lived token instead of one Plivo refuses.
  // The skew is part of the lifetime Plivo measures (`exp - nbf`), so it is
  // included in the clamp — adding it afterwards would push a maximum-TTL token
  // past the 24 hour ceiling and get it rejected outright.
  const lifetime = Math.min(
    Math.max(Math.floor(ttlSeconds), PLIVO_ACCESS_TOKEN_MIN_TTL_SECONDS) +
      PLIVO_ACCESS_TOKEN_CLOCK_SKEW_SECONDS,
    PLIVO_ACCESS_TOKEN_MAX_TTL_SECONDS,
  );

  const now = Math.floor(Date.now() / 1000);
  const validFrom = now - PLIVO_ACCESS_TOKEN_CLOCK_SKEW_SECONDS;
  const expiresAt = validFrom + lifetime;

  const voiceGrants: IPlivoVoiceGrants = {
    voice: {
      incoming_allow: true,
      outgoing_allow: true,
    },
  };

  const claims: IPlivoAccessTokenClaims = {
    jti: `${username}-${Date.now()}`,
    iss: authId,
    sub: username,
    nbf: validFrom,
    exp: expiresAt,
    grants: voiceGrants,
    per: voiceGrants,
  };

  if (appId) {
    claims.app = appId;
  }

  // `cty: 'plivo;v=1'` tells Plivo how to read the payload and is set by every
  // official Plivo SDK. `noTimestamp` drops the `iat` claim those SDKs never
  // emit, keeping the token byte-comparable with theirs.
  const token = jwt.sign(claims, authToken, {
    algorithm: 'HS256',
    header: { alg: 'HS256', typ: 'JWT', cty: 'plivo;v=1' },
    noTimestamp: true,
  });

  return {
    token,
    username,
    expiresAt,
    endpointUri: `sip:${username}@${PLIVO_ENDPOINT_DOMAIN}`,
  };
};
