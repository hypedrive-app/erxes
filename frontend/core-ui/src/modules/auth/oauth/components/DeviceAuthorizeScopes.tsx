import { IconCheck } from '@tabler/icons-react';

import { DeviceAuthorizeScopeGroup } from './DeviceAuthorizeScopeGroup';
import type { ActionGroup } from '../types';

type Props = {
  loadingDetails: boolean;
  loadError: string | null;
  isCodeMissing: boolean;
  isReady: boolean;
  actionGroups: ActionGroup[];
  selectedScopes: string[];
  loading: boolean;
  onToggle: (scopes: string[], checked: boolean) => void;
};

export const DeviceAuthorizeScopes = ({
  loadingDetails,
  loadError,
  isCodeMissing,
  isReady,
  actionGroups,
  selectedScopes,
  loading,
  onToggle,
}: Props) => {
  if (loadingDetails) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (isCodeMissing) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Device authorization code is missing.
      </div>
    );
  }

  // Previously `return null` — which rendered a card with a title, two buttons
  // and nothing in between, explaining nothing. The details request having
  // failed is the single most likely reason to land here (an expired or
  // already-used code), so it says so, and the Cancel button beside it still
  // works because deny() needs only the user code.
  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <p className="font-medium">Could not load this access request.</p>
        <p className="mt-1 text-destructive/80">{loadError}</p>
        <p className="mt-2 text-destructive/80">
          The code may have expired or already been used. Start the sign-in
          again from the device.
        </p>
      </div>
    );
  }

  if (!isReady) {
    return null;
  }

  const hasNoGrantableScopes = actionGroups.length === 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconCheck className="size-4 text-primary" />
          This application will be able to:
        </div>
        <p className="text-sm text-muted-foreground">
          Only permissions your account already has are shown here.
        </p>
      </div>

      {hasNoGrantableScopes ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Your account does not have any grantable permissions from this
          request.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {actionGroups.map((group, groupIndex) => (
            <DeviceAuthorizeScopeGroup
              key={group.action}
              group={group}
              groupIndex={groupIndex}
              selectedScopes={selectedScopes}
              loading={loading}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};
