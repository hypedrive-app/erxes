import {
  getEnv,
  getPlugin,
  getSaasOrganizationDetail,
  getSubdomain,
} from 'erxes-api-shared/utils';
import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { generateModels } from '~/connectionResolvers';
import { handleCoreLogin, magiclinkCallback, ssocallback } from '~/utils/saas';
import { IOrganizationCharge } from './types';

// Rate limiter for /ml-callback route: max 100 requests per 15 minutes per IP
const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const router: Router = Router();

router.get('/initial-setup', async (req: Request, res: Response) => {
  const subdomain = getSubdomain(req);
  const models = await generateModels(subdomain);

  let organizationInfo = {
    type: 'os',
    config: {},
    hasOwner: false,
  };

  const VERSION = getEnv({ name: 'VERSION', defaultValue: 'os' });

  if (VERSION && VERSION === 'saas') {
    organizationInfo = await getSaasOrganizationDetail({
      subdomain,
    });

    organizationInfo.type = 'saas';
  }

  if (VERSION && VERSION === 'os') {
    const orgWhiteLabel = await models.OrgWhiteLabel.getOrgWhiteLabel();

    if (orgWhiteLabel?.enabled) {
      organizationInfo = {
        ...organizationInfo,
        ...orgWhiteLabel,
      };
    }
  }

  const userCount = await models.Users.countDocuments({
    isOwner: true,
  });

  if (userCount === 0) {
    organizationInfo.hasOwner = false;
  } else {
    organizationInfo.hasOwner = true;
  }

  return res.json(organizationInfo);
});

router.get('/get-frontend-plugins', async (_req: Request, res: Response) => {
  const ENABLED_PLUGINS = getEnv({ name: 'ENABLED_PLUGINS' });
  const VERSION = getEnv({ name: 'VERSION', defaultValue: 'os' });

  const getPluginVersion = async (pluginName: string): Promise<string> => {
    try {
      const pluginInfo = await getPlugin(pluginName);
      return pluginInfo?.config?.releaseVersion || 'latest';
    } catch {
      return 'latest';
    }
  };

  // Module-federation container names cannot contain dashes — Nx builds
  // "erxes-agent_ui" as global `erxes_agent_ui` — so the runtime remote name
  // must use underscores while the CDN path keeps the plugin's real name.
  const remoteName = (pluginName: string): string =>
    `${pluginName.replace(/-/g, '_')}_ui`;

  // Where the browser fetches plugin remoteEntry.js from. Defaults to erxes'
  // own CDN, so an unset value behaves exactly as before.
  //
  // A self-hosted deployment running a FORK has to override this: the CDN
  // serves upstream's build of each plugin, so a locally modified plugin UI
  // would silently be replaced by upstream's — the browser loads a remote that
  // does not contain the local changes, with no error anywhere to explain it.
  const PLUGIN_CDN_URL = getEnv({
    name: 'PLUGIN_CDN_URL',
    defaultValue: 'https://plugins.erxes.io',
  }).replace(/\/+$/, '');

  const remoteEntry = (pluginName: string, version: string): string =>
    `${PLUGIN_CDN_URL}/${version}/${pluginName}_ui/remoteEntry.js`;

  if (VERSION === 'saas') {
    const remotes: { name: string; entry: string }[] = [];
    const subdomain = getSubdomain(_req);

    const organizationInfo = await getSaasOrganizationDetail({
      subdomain,
    });

    const charges = organizationInfo.charge as IOrganizationCharge;

    const enabledPluginsArray = ENABLED_PLUGINS.split(',');

    for (const key of Object.keys(charges)) {
      if (
        (charges[key].purchased && charges[key].purchased > 0) ||
        (charges[key].free && charges[key].free > 0)
      ) {
        const pluginName = key.split(':')[0];

        if (enabledPluginsArray.includes(pluginName)) {
          const version = await getPluginVersion(pluginName);
          remotes.push({
            name: remoteName(pluginName),
            entry: remoteEntry(pluginName, version),
          });
        }
      }
    }

    const hasAgentUi = remotes.some((remote) => remote.name === 'agent_ui');

    if (!hasAgentUi) {
      const agentVersion = await getPluginVersion('agent');
      remotes.push({
        name: 'agent_ui',
        entry: remoteEntry('agent', agentVersion),
      });
    }

    return res.json(remotes);
  } else {
    const remotes: { name: string; entry: string }[] = [];

    if (ENABLED_PLUGINS) {
      for (const plugin of ENABLED_PLUGINS.split(',')) {
        const version = await getPluginVersion(plugin);
        remotes.push({
          name: remoteName(plugin),
          entry: remoteEntry(plugin, version),
        });
      }
    }

    return res.json(remotes);
  }
});

router.get('/sso-callback', callbackLimiter, ssocallback);
router.get('/ml-callback', callbackLimiter, magiclinkCallback);
router.get('/core-login', callbackLimiter, handleCoreLogin);

export { router };
