declare global {
  interface Window {
    env?: Record<string, string>;
    __APOLLO_CLIENT__?: any;
  }
}

const getDefaultUrl = () => {
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:4000';
  } else {
    return `${window.location.protocol}//${window.location.hostname}/gateway`;
  }
};

const getSubdomain = () => {
  return window.location.hostname.split('.')[0];
};

let memoizedApiUrl: string | null = null;

const getApi = (): string => {
  // if (memoizedApiUrl) return memoizedApiUrl;

  const envApiUrl =
    window.env?.REACT_APP_API_URL ??
    (process.env.REACT_APP_API_URL || getDefaultUrl());

  memoizedApiUrl = envApiUrl?.includes('<subdomain>')
    ? envApiUrl.replace('<subdomain>', getSubdomain())
    : envApiUrl;

  return memoizedApiUrl;
};

const cdnUrl = () => {
  return (
    window.env?.REACT_APP_IMAGE_CDN_URL ?? process.env.REACT_APP_IMAGE_CDN_URL
  );
};

const googleMapApiKey = () => {
  return (
    window.env?.REACT_APP_GOOGLE_MAP_API_KEY ??
    process.env.REACT_APP_GOOGLE_MAP_API_KEY
  );
};

const hideCoreModules = () => {
  return (
    window.env?.REACT_APP_HIDE_CORE_MODULES ??
    process.env.REACT_APP_HIDE_CORE_MODULES
  );
};

const sentryDsn = () => {
  return window.env?.REACT_APP_SENTRY_DSN ?? process.env.REACT_APP_SENTRY_DSN;
};

const sentryEnvironment = () => {
  return (
    window.env?.REACT_APP_SENTRY_ENVIRONMENT ??
    process.env.REACT_APP_SENTRY_ENVIRONMENT
  );
};

/**
 * Label for the OIDC sign-in button on the login screen, e.g. the name of the
 * identity provider. Empty means no provider is configured, and the button is
 * not rendered at all -- the backend's `/auth/oidc/*` routes answer 404 in that
 * case, so showing it would offer a login that cannot work.
 */
const oidcProviderName = () => {
  return (
    window.env?.REACT_APP_OIDC_PROVIDER_NAME ??
    process.env.REACT_APP_OIDC_PROVIDER_NAME
  );
};

/** Optional logo shown on that button. Falls back to a generic key icon. */
const oidcProviderIconUrl = () => {
  return (
    window.env?.REACT_APP_OIDC_PROVIDER_ICON_URL ??
    process.env.REACT_APP_OIDC_PROVIDER_ICON_URL
  );
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const REACT_APP_API_URL = getApi();
const REACT_APP_IMAGE_CDN_URL = cdnUrl();
const REACT_APP_GOOGLE_MAP_API_KEY = googleMapApiKey();
const REACT_APP_HIDE_CORE_MODULES = hideCoreModules();
const REACT_APP_SENTRY_DSN = sentryDsn();
const REACT_APP_SENTRY_ENVIRONMENT = sentryEnvironment();
const REACT_APP_OIDC_PROVIDER_NAME = oidcProviderName();
const REACT_APP_OIDC_PROVIDER_ICON_URL = oidcProviderIconUrl();

export {
  NODE_ENV,
  REACT_APP_API_URL,
  REACT_APP_IMAGE_CDN_URL,
  REACT_APP_GOOGLE_MAP_API_KEY,
  REACT_APP_HIDE_CORE_MODULES,
  REACT_APP_SENTRY_DSN,
  REACT_APP_SENTRY_ENVIRONMENT,
  REACT_APP_OIDC_PROVIDER_NAME,
  REACT_APP_OIDC_PROVIDER_ICON_URL,
};
