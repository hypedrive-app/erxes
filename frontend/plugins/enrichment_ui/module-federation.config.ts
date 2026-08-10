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
  name: 'enrichment_ui',
  exposes: {
    './config': './src/config.tsx',
    './enrichment': './src/modules/EnrichmentMain.tsx',
    './enrichmentSettings': './src/modules/EnrichmentSettings.tsx',
    // 'relationWidget', NOT the generator's './widgets': core-ui loads contact
    // widgets through RenderPluginsComponent with remoteModuleName
    // "relationWidget". Under any other name the remote resolves to nothing and
    // the tab renders empty with no error anywhere — calcom_ui hit exactly this.
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
