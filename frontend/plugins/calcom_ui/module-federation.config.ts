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
