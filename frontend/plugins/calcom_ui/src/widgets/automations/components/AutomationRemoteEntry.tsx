import { Spinner } from 'erxes-ui';
import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { AutomationRemoteEntryProps } from 'ui-modules';

const BookingsRemoteEntry = lazy(() =>
  import('./BookingsRemoteEntry').then((module) => ({
    default: module.BookingsRemoteEntry,
  })),
);

/**
 * `automationsWidget` remote — the surface core's automation builder loads to
 * render this plugin's trigger and action configuration.
 *
 * Without this expose the builder still LISTS calcom's triggers and action,
 * because those come from the backend's startPlugin meta and core matches them
 * itself. Selecting one then failed to load `calcom_ui/automationsWidget` and
 * showed a plugin-load error where the config panel should be — a trigger you
 * can pick but not configure.
 *
 * Keyed by module name, matching the `moduleName` core passes down; `bookings`
 * is the only module in config.tsx that sets `hasAutomation`.
 */
const Remotes: Record<
  string,
  LazyExoticComponent<ComponentType<AutomationRemoteEntryProps>>
> = {
  bookings: BookingsRemoteEntry,
};

export const AutomationRemoteEntries = ({
  moduleName,
  ...props
}: AutomationRemoteEntryProps & { moduleName: string }) => {
  const RemoteComponent = Remotes[moduleName];

  if (!RemoteComponent) {
    return null;
  }

  return (
    <ErrorBoundary
      fallback={
        <p className="p-4 text-sm text-muted-foreground">
          Could not load the Cal.com configuration for this step.
        </p>
      }
    >
      <Suspense fallback={<Spinner />}>
        <RemoteComponent {...(props as AutomationRemoteEntryProps)} />
      </Suspense>
    </ErrorBoundary>
  );
};

export default AutomationRemoteEntries;
