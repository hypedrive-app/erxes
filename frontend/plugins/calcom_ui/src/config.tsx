
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

  // Each `path` carries the plugin prefix, matching sales ("sales/deals"),
  // frontline ("frontline/channels") and operation ("operation/team"). It is
  // not decorative: useNavigationActivities derives a group's landing route as
  // `modules[0].path` verbatim, so a bare "bookings" sent the sidebar's Calcom
  // button to /bookings — a route that does not exist — instead of
  // /calcom/bookings.
  modules: [
    {
      name: 'bookings',
      icon: IconCalendarEvent,
      path: 'calcom/bookings',
      // The backend registers booking triggers and a cancel action via
      // startPlugin's meta.automations; without this flag the automation
      // builder never offers them.
      hasAutomation: true,
      hasRelationWidget: true,
    },
    {
      name: 'eventTypes',
      path: 'calcom/event-types',
    },
    {
      name: 'schedules',
      path: 'calcom/schedules',
    },
    {
      name: 'teams',
      path: 'calcom/teams',
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
