import { getSubdomain } from 'erxes-api-shared/utils';
import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';

import { generateModels } from '~/connectionResolvers';

import {
  authorizationEndpoint,
  getOidcConfig,
  isOidcEnabled,
} from './config';
import { resolveOidcUser } from './provision';
import { establishOidcSession } from './session';
import {
  buildAuthorizationUrl,
  consumeOidcState,
  createOidcState,
  exchangeCodeForTokens,
  fetchUserInfo,
  safeRedirectPath,
} from './utils';

export const router: Router = Router();

const oidcLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Starts the login. The user lands here (a link or bookmark), and leaves
 * pointed at the identity provider.
 */
router.get(
  '/auth/oidc/login',
  oidcLimiter,
  async (req: Request, res: Response) => {
    if (!isOidcEnabled()) {
      return res.sendStatus(404);
    }

    try {
      const config = getOidcConfig();
      const state = await createOidcState(
        safeRedirectPath(req.query.redirect as string),
      );

      return res.redirect(
        buildAuthorizationUrl(config, authorizationEndpoint(config), state),
      );
    } catch (e) {
      console.error(`OIDC login failed to start: ${e.message}`);
      return res.sendStatus(500);
    }
  },
);

/**
 * Where the provider sends the user back.
 *
 * Every failure deliberately ends at the normal login page rather than an error
 * page: the provider is not necessarily trusted to have sent a valid code, and
 * a failed SSO attempt should leave password login reachable.
 */
router.get(
  '/auth/oidc/callback',
  oidcLimiter,
  async (req: Request, res: Response) => {
    if (!isOidcEnabled()) {
      return res.sendStatus(404);
    }

    const config = getOidcConfig();
    const loginPage = `${config.appDomain}/login`;

    try {
      if (req.query.error) {
        console.error(`OIDC provider returned: ${req.query.error}`);
        return res.redirect(loginPage);
      }

      const code = req.query.code as string;
      const stateData = await consumeOidcState(req.query.state as string);

      // A missing state means the callback was replayed, forged, or simply
      // expired. None of those should mint a session.
      if (!code || !stateData) {
        return res.redirect(loginPage);
      }

      const tokens = await exchangeCodeForTokens(config, code);
      const profile = await fetchUserInfo(config, tokens.access_token);

      // An unverified address must not be accepted: it is the only thing tying
      // the provider's account to an erxes user.
      if (!profile.email || profile.email_verified === false) {
        console.error('OIDC profile has no verified email; refusing login.');
        return res.redirect(loginPage);
      }

      const subdomain = getSubdomain(req);
      const models = await generateModels(subdomain);
      const user = await resolveOidcUser(models, config, profile);

      if (!user) {
        console.error(
          `OIDC login refused: ${profile.email} is not an active erxes user.`,
        );
        return res.redirect(loginPage);
      }

      await establishOidcSession(models, res, user, Boolean(req.secure));

      return res.redirect(`${config.appDomain}${stateData.redirectPath}`);
    } catch (e) {
      console.error(`OIDC callback failed: ${e.message}`);
      return res.redirect(loginPage);
    }
  },
);
