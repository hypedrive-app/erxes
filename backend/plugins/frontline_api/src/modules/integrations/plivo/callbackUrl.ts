import { getEnv } from 'erxes-api-shared/utils';
import { PLIVO_CALLBACK_MOUNT_PATH } from '@/integrations/plivo/constants';

/**
 * Strips trailing slashes so a `DOMAIN` written with or without one produces the
 * same URL. The digest covers the URL byte for byte, so `//plivo/answer` and
 * `/plivo/answer` are different signatures entirely.
 */
const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * Base URL Plivo calls back on, and the ONLY definition of it.
 *
 * This value has two jobs that must never disagree: it is registered with Plivo
 * as `answer_url`/`hangup_url`, and it is what the V3 signature is verified
 * against. Plivo signs the URL it was configured with, so if the address we
 * register and the address we verify are built differently, every callback fails
 * verification — which is exactly the bug this module exists to prevent.
 *
 * It cannot be reconstructed from the inbound request. The gateway proxies
 * `/pl:frontline/plivo/*` to the plugin after rewriting the path down to
 * `/plivo/*`, and forwards neither the original prefix nor `x-forwarded-host`,
 * so a request-derived URL is missing the mount prefix AND the public hostname.
 *
 * `PLIVO_CALLBACK_PUBLIC_URL` is the escape hatch for deployments whose public
 * address is not `DOMAIN` — this stack serves the API on a different hostname
 * than the web app, and a webhook pointed at the web app's host never reaches
 * the plugin at all.
 */
export const getPlivoCallbackBaseUrl = (subdomain: string): string => {
  const configured = getEnv({
    name: 'PLIVO_CALLBACK_PUBLIC_URL',
    subdomain,
    defaultValue: '',
  });

  if (configured) {
    return `${trimTrailingSlash(configured)}${PLIVO_CALLBACK_MOUNT_PATH}`;
  }

  const domain = getEnv({ name: 'DOMAIN', subdomain, defaultValue: '' });

  if (!domain) {
    throw new Error(
      'PLIVO_CALLBACK_PUBLIC_URL or DOMAIN must be configured so Plivo can reach the call webhooks',
    );
  }

  return `${trimTrailingSlash(domain)}${PLIVO_CALLBACK_MOUNT_PATH}`;
};
