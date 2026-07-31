import { USER_ROLES } from 'erxes-api-shared/core-modules';
import { IUserDocument } from 'erxes-api-shared/core-types';

import { IModels } from '~/connectionResolvers';

import { OidcConfig } from './config';
import { OidcProfile } from './utils';

/**
 * Maps a verified provider profile onto an erxes user.
 *
 * The lookup deliberately matches what the WorkOS `ssocallback` already does --
 * active, non-SYSTEM, matched on email -- so SSO grants exactly the access an
 * administrator already granted, and nothing more.
 *
 * Auto-creating a user is off by default and should stay that way unless the
 * provider's population is exactly the set of people who should have an erxes
 * seat. A new user lands with no `groupIds`, i.e. an undefined permission
 * posture rather than a deliberately restricted one, so silently minting them
 * from any successful login at a shared identity provider is a privilege
 * escalation path. When it is turned on, an email-domain allowlist is required
 * so it can never exceed a known set of addresses.
 */
export const resolveOidcUser = async (
  models: IModels,
  config: OidcConfig,
  profile: OidcProfile,
): Promise<IUserDocument | null> => {
  const email = (profile.email || '').trim().toLowerCase();

  if (!email) {
    return null;
  }

  const existing = await models.Users.findOne({
    email,
    isActive: true,
    role: { $ne: USER_ROLES.SYSTEM },
  });

  if (existing) {
    return existing;
  }

  if (!config.allowJitProvision) {
    return null;
  }

  const domain = email.split('@')[1] || '';

  // An empty allowlist refuses everything rather than allowing everything: the
  // safer reading of "not configured".
  if (!config.allowedEmailDomains.includes(domain)) {
    return null;
  }

  return models.Users.createUser({
    email,
    username: email,
    details: { fullName: profile.name || email },
    links: [],
    // No password is ever set, so provisioning here cannot open a
    // password-login path for an account the provider later disables.
    notUsePassword: true,
  } as any);
};
