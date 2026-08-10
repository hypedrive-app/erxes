
import { IconSparkles } from '@tabler/icons-react';
import { lazy, Suspense } from 'react';
import { IUIConfig } from 'erxes-ui';

const EnrichmentSettingsNavigation = lazy(() =>
  import('@/EnrichmentSettingsNavigation').then((module) => ({
    default: module.EnrichmentSettingsNavigation,
  })),
);

const EnrichmentNavigation = lazy(() =>
  import('@/EnrichmentNavigation').then((module) => ({
    default: module.EnrichmentNavigation,
  })),
);


export const CONFIG: IUIConfig = {
  name: 'enrichment',
  path: 'enrichment',
  settingsNavigation: () => (
    <Suspense fallback={<div />}>
      <EnrichmentSettingsNavigation />
    </Suspense>
  ),
  navigationGroup: {
    name: 'enrichment',
    icon: IconSparkles,
    content: () => (
      <Suspense fallback={<div />}>
        <EnrichmentNavigation />
      </Suspense>
    ),
  },

  modules: [
    {
      name: 'providers',
      icon: IconSparkles,
      path: 'providers',
      // Without this the module never appears in the relation-widget tab list,
      // no matter what `widgets` below declares.
      hasRelationWidget: true,
    },
  ],

  // Declares the contact-panel tab. useRelationWidgetsModules builds the tab
  // list from exactly this array — the module federation expose alone is not
  // enough, nothing would ever request it.
  widgets: {
    relationWidgets: [
      {
        name: 'providers',
        icon: IconSparkles,
        label: 'Enrichment',
      },
    ],
  },
};
