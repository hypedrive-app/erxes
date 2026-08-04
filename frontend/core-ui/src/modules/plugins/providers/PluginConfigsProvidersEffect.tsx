import { getInstance, loadRemote } from '@module-federation/enhanced/runtime';
import type { IUIConfig } from 'erxes-ui';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { loadingPluginsConfigState, pluginsConfigState } from 'ui-modules';
import { i18nInstance } from '~/i18n';

type RemoteConfig = {
  CONFIG: IUIConfig;
};

export const loadPluginI18nNamespace = async ({
  i18n,
  i18nNamespace,
  name,
}: Pick<IUIConfig, 'i18n' | 'i18nNamespace' | 'name'>) => {
  const namespace = i18nNamespace ?? (i18n ? name : undefined);

  if (!namespace) {
    return;
  }

  try {
    await i18nInstance.loadNamespaces(namespace);
  } catch (error) {
    console.error(
      `Failed to load translation namespace "${namespace}" for ${name}:`,
      error,
    );
  }
};

export const PluginConfigsProvidersEffect = () => {
  const instance = getInstance();
  const remotes = instance?.options.remotes;
  const setPluginsConfig = useSetAtom(pluginsConfigState);
  const setLoadingPluginsConfig = useSetAtom(loadingPluginsConfigState);

  useEffect(() => {
    if (!remotes || remotes.length === 0) {
      // Nothing to wait for. Without this the flag would stay true forever and
      // every unmatched route would render a loading screen instead of a 404.
      setLoadingPluginsConfig(false);
      return;
    }

    const loadConfig = async () => {
      // Loaded in parallel rather than sequentially: these are independent
      // network fetches, and awaiting them one at a time made first paint wait
      // on the slowest chain of all of them.
      await Promise.all(
        remotes.map(async (remote) => {
          try {
            const remoteConfig = (await loadRemote(
              `${remote.name}/config`,
            )) as RemoteConfig;
            const pluginConfig = remoteConfig.CONFIG;

            await loadPluginI18nNamespace(pluginConfig);

            setPluginsConfig((prev) => ({
              ...prev,
              [remote.name]: pluginConfig,
            }));
          } catch (error) {
            // Swallowed per plugin, deliberately: one plugin failing to load
            // must not stop the others from registering their routes.
            console.error(`Failed to load config from ${remote.name}:`, error);
          }
        }),
      );

      // Cleared ONCE, after every plugin has been accounted for.
      //
      // This used to fire inside the loop, after the FIRST plugin resolved. The
      // router builds its plugin routes from pluginsConfigState, and
      // NotFoundPage renders as soon as this flag is false — so on a cold load
      // of a deep link like /frontline/inbox, the flag cleared while three of
      // four plugins were still loading and the catch-all "*" route won. The
      // page 404'd even though nginx had served index.html with a 200.
      setLoadingPluginsConfig(false);
    };

    loadConfig();
  }, [remotes, setPluginsConfig, setLoadingPluginsConfig]);

  return null;
};
