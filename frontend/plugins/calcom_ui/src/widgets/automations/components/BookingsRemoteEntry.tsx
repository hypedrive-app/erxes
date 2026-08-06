import { lazy } from 'react';
import {
  AutomationExecutionHistoryNameProps,
  AutomationRemoteEntryProps,
  AutomationRemoteEntryWrapper,
} from 'ui-modules';

const CancelBookingActionConfigForm = lazy(() =>
  import('./action/CancelBookingActionConfigForm').then((module) => ({
    default: module.CancelBookingActionConfigForm,
  })),
);

const CancelBookingActionNodeContent = lazy(() =>
  import('./action/CancelBookingActionNodeContent').then((module) => ({
    default: module.CancelBookingActionNodeContent,
  })),
);

/**
 * Remote entries for the `bookings` module.
 *
 * Only the action needs a surface. The seven triggers are plain event triggers
 * with no per-trigger configuration — none is `isCustom`, so core matches them
 * itself and renders their attribute list from the backend's `output.variables`
 * without asking this plugin for anything.
 */
export const BookingsRemoteEntry = (props: AutomationRemoteEntryProps) => {
  return (
    <AutomationRemoteEntryWrapper
      props={props}
      remoteEntries={{
        actionForm: CancelBookingActionConfigForm,
        actionNodeConfiguration: CancelBookingActionNodeContent,
        historyName: ({
          target,
        }: AutomationExecutionHistoryNameProps<Record<string, unknown>>) =>
          String(target?.title || target?.uid || target?._id || ''),
      }}
    />
  );
};
