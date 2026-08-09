import { getEnv } from 'erxes-api-shared/utils';

/**
 * Config for logging in through an external OpenID Connect provider.
 *
 * erxes' own SSO is WorkOS-brokered and gated behind `assertSaasEnvironment()`,
 * so a self-hosted instance (VERSION=os) has no way to delegate login. This
 * adds a standard OIDC authorization-code flow for one, without touching the
 * password login that remains the default.
 *
 * Everything is read from the environment, so the feature is invisible unless a
 * deployment configures it, and no credential is ever committed.
 */
export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appDomain: string;
  scopes: string;
  allowJitProvision: boolean;
  allowedEmailDomains: string[];
};

const read = (name: string): string =>
  (getEnv({ name, defaultValue: '' }) || '').trim();

/**
 * Whether a provider is configured. The four values below have no sensible
 * default, so their presence is what turns the routes on: an unconfigured
 * deployment answers 404 rather than exposing a half-built login path.
 *
 * OIDC_REDIRECT_URI is part of the gate even though only the other three are
 * "identity". It used to be omitted here while getOidcConfig() still required
 * it, so a deployment that set the first three and forgot the fourth passed
 * this check, reached getOidcConfig(), and threw — turning a missing-config
 * mistake into a 500 on the login route instead of the intended 404. Keeping
 * both functions on the same four keys means "enabled" and "usable" cannot
 * disagree.
 */
export const isOidcEnabled = (): boolean =>
  Boolean(
    read('OIDC_ISSUER') &&
      read('OIDC_CLIENT_ID') &&
      read('OIDC_CLIENT_SECRET') &&
      read('OIDC_REDIRECT_URI'),
  );

export const getOidcConfig = (): OidcConfig => {
  const issuer = read('OIDC_ISSUER').replace(/\/$/, '');
  const clientId = read('OIDC_CLIENT_ID');
  const clientSecret = read('OIDC_CLIENT_SECRET');
  const redirectUri = read('OIDC_REDIRECT_URI');
  const appDomain = read('OIDC_APP_DOMAIN') || getEnv({ name: 'DOMAIN' });

  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'OIDC login is enabled but incomplete: OIDC_ISSUER, OIDC_CLIENT_ID, ' +
        'OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI are all required.',
    );
  }

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    appDomain: (appDomain || '').replace(/\/$/, ''),
    scopes: read('OIDC_SCOPES') || 'openid profile email',
    allowJitProvision: read('OIDC_ALLOW_JIT_PROVISION') === 'true',
    allowedEmailDomains: read('OIDC_ALLOWED_EMAIL_DOMAINS')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
};

/** Endpoints derived from the issuer, per OIDC discovery conventions. */
export const authorizationEndpoint = (c: OidcConfig) => `${c.issuer}/auth`;
export const tokenEndpoint = (c: OidcConfig) => `${c.issuer}/token`;
export const userInfoEndpoint = (c: OidcConfig) => `${c.issuer}/me`;
