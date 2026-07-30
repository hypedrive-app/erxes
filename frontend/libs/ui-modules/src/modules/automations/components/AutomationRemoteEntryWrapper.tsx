import React from 'react';
import {
  AutomationRemoteEntryComponentType,
  AutomationRemoteEntryTypes,
} from '../types/automationTypes';

export const AutomationRemoteEntryWrapper = <
  T extends AutomationRemoteEntryComponentType,
>({
  props,
  remoteEntries,
}: {
  props: AutomationRemoteEntryTypes[T] & { componentType: T };
  remoteEntries: {
    [K in AutomationRemoteEntryComponentType]?:
      | React.LazyExoticComponent<
          React.ComponentType<AutomationRemoteEntryTypes[K]>
        >
      | React.ComponentType<AutomationRemoteEntryTypes[K]>;
  };
}) => {
  const { componentType } = props;

  // `T` is still unresolved inside this component, and TS cannot spread an
  // unresolved generic into JSX. Resolving the lookup to the union of every
  // remote entry's props keeps the check meaningful while staying assignable;
  // the caller-facing generic signature above is unaffected.
  const RemoteEntryComponent = remoteEntries[componentType] as
    | React.ComponentType<
        AutomationRemoteEntryTypes[AutomationRemoteEntryComponentType]
      >
    | undefined;

  if (!RemoteEntryComponent) return null;

  return <RemoteEntryComponent {...props} />;
};
