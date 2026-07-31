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
  tokensMatch,
} from './utils';

export const router: Router = Router();

const oidcLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Ties one login attempt to one browser. Short-lived and httpOnly: it is only
 * ever compared against the copy held in redis, never read by script.
 */
const BROWSER_TOKEN_COOKIE = 'oidc-flow';

const browserTokenCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  maxAge: 10 * 60 * 1000,
  sameSite: 'lax' as const,
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
      const { state, codeChallenge, browserToken } = await createOidcState(
        safeRedirectPath(req.query.redirect as string),
      );

      res.cookie(
        BROWSER_TOKEN_COOKIE,
        browserToken,
        browserTokenCookieOptions(Boolean(req.secure)),
      );

      return res.redirect(
        buildAuthorizationUrl(
          config,
          authorizationEndpoint(config),
          state,
          codeChallenge,
        ),
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

      // RFC 9207: when the provider names itself, make sure it is the one we
      // sent the user to. Cheap, and it forecloses mix-up attacks outright if a
      // second provider is ever configured.
      const iss = req.query.iss as string;
      if (iss && iss.replace(/\/$/, '') !== config.issuer) {
        console.error(`OIDC callback from unexpected issuer: ${iss}`);
        return res.redirect(loginPage);
      }

      const code = req.query.code as string;
      const stateData = await consumeOidcState(req.query.state as string);

      // A missing state means the callback was replayed, forged, or simply
      // expired. None of those should mint a session.
      if (!code || !stateData) {
        return res.redirect(loginPage);
      }

      // The flow must be finished by the browser that started it. Without this,
      // an attacker can begin a login, then hand the victim the resulting
      // callback URL and silently log them into the attacker's account
      // (login CSRF, RFC 9700 4.7.1).
      const browserToken = req.cookies?.[BROWSER_TOKEN_COOKIE];
      res.clearCookie(BROWSER_TOKEN_COOKIE);

      if (!tokensMatch(browserToken, stateData.browserToken)) {
        console.error('OIDC callback did not come from the browser that started the login.');
        return res.redirect(loginPage);
      }

      const tokens = await exchangeCodeForTokens(
        config,
        code,
        stateData.codeVerifier,
      );
      const profile = await fetchUserInfo(config, tokens.access_token);

      // Require the address to be positively verified. The email is the only
      // thing tying the provider's account to an erxes user, so an absent claim
      // is treated the same as an explicit `false` -- some providers simply
      // omit it for identities they never verified.
      if (!profile.email || profile.email_verified !== true) {
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
