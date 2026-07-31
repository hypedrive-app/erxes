import { IUserDocument } from 'erxes-api-shared/core-types';
import { authCookieOptions, getEnv } from 'erxes-api-shared/utils';
import { Response } from 'express';

import { IModels } from '~/connectionResolvers';
import { saveValidatedToken } from '~/modules/auth/utils';

/**
 * Turns a resolved user into a logged-in browser session.
 *
 * Deliberately identical to what the password login does in
 * `modules/auth/graphql/resolvers/mutations.ts`, because the gateway is a
 * prebuilt image we do not control: it verifies the JWT with
 * `JWT_TOKEN_SECRET` *and* requires the matching `user_token_*` key in redis.
 * Minting the token any other way, or skipping `saveValidatedToken`, produces a
 * cookie the gateway silently ignores -- the browser looks logged in and every
 * request comes back anonymous.
 */
export const establishOidcSession = async (
  models: IModels,
  res: Response,
  user: IUserDocument,
  secure: boolean,
): Promise<void> => {
  const [token] = await models.Users.createTokens(
    user,
    models.Users.getSecret(),
  );

  await saveValidatedToken(token, user);

  const sameSite = getEnv({ name: 'SAME_SITE', defaultValue: '' });
  const cookieOptions: any = { secure };

  if (sameSite === 'none') {
    cookieOptions.sameSite = sameSite;
  }

  res.cookie('auth-token', token, authCookieOptions(cookieOptions));
};
