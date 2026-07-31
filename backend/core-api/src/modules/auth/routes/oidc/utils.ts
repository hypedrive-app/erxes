import { randomUUID } from 'crypto';
import { redis } from 'erxes-api-shared/utils';

import {
  OidcConfig,
  tokenEndpoint,
  userInfoEndpoint,
} from './config';

const STATE_PREFIX = 'oidc_state_';
const STATE_TTL_SECONDS = 600;

export type OidcProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

/**
 * Mints the `state` parameter.
 *
 * It is stored server-side rather than signed into the URL so that consuming it
 * can delete it, which makes a callback URL single-use: replaying a captured
 * callback finds no state and is rejected. It also carries where to land the
 * user afterwards, so that is not attacker-controlled either.
 */
export const createOidcState = async (redirectPath: string): Promise<string> => {
  const state = randomUUID();

  await redis.set(
    `${STATE_PREFIX}${state}`,
    JSON.stringify({ redirectPath }),
    'EX',
    STATE_TTL_SECONDS,
  );

  return state;
};

export const consumeOidcState = async (
  state: string,
): Promise<{ redirectPath: string } | null> => {
  if (!state) {
    return null;
  }

  const key = `${STATE_PREFIX}${state}`;
  const raw = await redis.get(key);

  // Delete before returning: a state must not survive its first use, even if
  // the rest of the callback then fails.
  await redis.del(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return { redirectPath: parsed.redirectPath || '/' };
  } catch {
    return null;
  }
};

/**
 * Only ever redirect within our own app. Anything absolute or protocol-relative
 * would turn the callback into an open redirect.
 */
export const safeRedirectPath = (value?: string): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
};

export const buildAuthorizationUrl = (
  config: OidcConfig,
  authorizationUrl: string,
  state: string,
): string => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes,
    state,
  });

  return `${authorizationUrl}?${params.toString()}`;
};

/**
 * Exchanges the authorization code for tokens.
 *
 * This is a direct server-to-server call to the provider over TLS, authenticated
 * with the client secret, so the response arrived over a trusted channel and its
 * contents do not need their signature re-checked here. That is what keeps this
 * free of a JWKS/`openid-client` dependency.
 */
export const exchangeCodeForTokens = async (
  config: OidcConfig,
  code: string,
): Promise<{ access_token: string; id_token?: string }> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString('base64');

  const response = await fetch(tokenEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `OIDC token exchange failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<{ access_token: string; id_token?: string }>;
};

export const fetchUserInfo = async (
  config: OidcConfig,
  accessToken: string,
): Promise<OidcProfile> => {
  const response = await fetch(userInfoEndpoint(config), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `OIDC userinfo failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<OidcProfile>;
};
