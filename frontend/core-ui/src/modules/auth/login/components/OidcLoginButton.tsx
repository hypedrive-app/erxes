import {
  Button,
  REACT_APP_API_URL,
  REACT_APP_OIDC_PROVIDER_ICON_URL,
  REACT_APP_OIDC_PROVIDER_NAME,
} from 'erxes-ui';
import { IconKey } from '@tabler/icons-react';

/**
 * Starts a login against the configured OpenID Connect provider.
 *
 * This is a plain link rather than a fetch: the flow is a series of top-level
 * redirects (here -> provider -> back to the API's callback -> the app), and the
 * session cookie is set on that final redirect. An XHR could not follow it.
 *
 * Renders nothing unless a provider name is configured, so a deployment without
 * OIDC sees the login screen exactly as before -- and no one is offered a
 * button whose backend routes answer 404.
 */
export const OidcLoginButton = () => {
  const providerName = REACT_APP_OIDC_PROVIDER_NAME;

  if (!providerName) {
    return null;
  }

  const iconUrl = REACT_APP_OIDC_PROVIDER_ICON_URL;
  // The routes live on the API host, not this one.
  const loginUrl = `${REACT_APP_API_URL?.replace(/\/$/, '')}/auth/oidc/login`;

  return (
    <div className="flex flex-col gap-4 mb-4">
      <Button
        asChild
        variant="outline"
        className="flex shadow-sm h-8 w-full"
      >
        <a href={loginUrl}>
          {iconUrl ? (
            <img src={iconUrl} alt="" aria-hidden className="size-4" />
          ) : (
            <IconKey className="size-4" />
          )}
          <span className="text-sm font-semibold">
            Continue with {providerName}
          </span>
        </a>
      </Button>

      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
};
