
import { IconCalendarEvent } from '@tabler/icons-react';
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
    icon: IconCalendarEvent,
    content: () => (
      <Suspense fallback={<div />}>
        <CalcomNavigation />
      </Suspense>
    ),
  },

  modules: [
    {
      name: 'bookings',
      icon: IconCalendarEvent,
      path: 'bookings',
      // The backend registers booking triggers and a cancel action via
      // startPlugin's meta.automations; without this flag the automation
      // builder never offers them.
      hasAutomation: true,
      hasRelationWidget: true,
    },
    {
      name: 'eventTypes',
      path: 'event-types',
    },
    {
      name: 'schedules',
      path: 'schedules',
    },
    {
      name: 'teams',
      path: 'teams',
    },
  ],

  // Declares the contact-panel tab. useRelationWidgetsModules builds the tab
  // list from exactly this array — the module federation expose alone is not
  // enough, nothing would ever request it.
  widgets: {
    relationWidgets: [
      {
        name: 'bookings',
        icon: IconCalendarEvent,
        label: 'Cal.com bookings',
      },
    ],
  },
};
