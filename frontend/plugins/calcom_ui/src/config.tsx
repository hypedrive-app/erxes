
import { IconSandbox } from '@tabler/icons-react';
import { lazy, Suspense } from 'react';
import { IUIConfig } from 'erxes-ui';

const CalcomSettingsNavigation = lazy(() =>
  import('@/CalcomSettingsNavigation').then((module) => ({
    default: module.CalcomSettingsNavigation,
  })),
);

const CalcomNavigation = lazy(() =>
  import('@/CalcomNavigation').then((module) => ({
    default: module.CalcomNavigation,
  })),
);


export const CONFIG: IUIConfig = {
  name: 'calcom',
  path: 'calcom',
  settingsNavigation: () => (
    <Suspense fallback={<div />}>
      <CalcomSettingsNavigation />
    </Suspense>
  ),
  navigationGroup: {
    name: 'calcom',
    icon: IconSandbox,
    content: () => (
      <Suspense fallback={<div />}>
        <CalcomNavigation />
      </Suspense>
    ),
  },

  modules: [
    {
      name: 'bookings',
      icon: IconSandbox,
      path: 'bookings',
    },
  ],
};
