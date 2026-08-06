import { ModuleFederationConfig } from '@nx/rspack/module-federation';

const coreLibraries = new Set([
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
  'erxes-ui',
  '@apollo/client',
  'jotai',
  'ui-modules',
  'react-i18next',
]);

export const config: ModuleFederationConfig = {
  name: 'calcom_ui',
  exposes: {
    './config': './src/config.tsx',
    './calcom': './src/modules/CalcomMain.tsx',
    './calcomSettings': './src/modules/CalcomSettings.tsx',
    // 'relationWidget', not the generator's './widgets': core-ui loads contact
    // widgets via RenderPluginsComponent with remoteModuleName="relationWidget"
    // (WidgetsComponent.tsx), so an expose named anything else is never
    // requested and the widget silently never renders.
    './relationWidget': './src/widgets/Widgets.tsx',
    // Required by core-ui, not optional: core-api emits a
    // `<plugin>:system.welcome` notification for every enabled plugin, and
    // NotificationContent.tsx renders its detail by loading this exact remote
    // name. Without it, opening that notification shows
    // "Module unavailable — calcom_ui/notificationWidget".
    './notificationWidget': './src/widgets/NotificationRemoteEntries.tsx',
    // config.tsx sets hasAutomation on the bookings module and the backend
    // registers 7 triggers and 1 action, so core's builder lists them and then
    // loads this remote to configure the selected node. Without the expose it
    // rendered a plugin-load error instead of the config panel — the triggers
    // were selectable but not usable.
    './automationsWidget':
      './src/widgets/automations/components/AutomationRemoteEntry.tsx',
  },

  shared: (libraryName, defaultConfig) => {
    if (coreLibraries.has(libraryName)) {
      return defaultConfig;
    }

    // Returning false means the library is not shared.
    return false;
  },
};

// Default export required by Nx/Rspack tooling - do not remove
export default config;
