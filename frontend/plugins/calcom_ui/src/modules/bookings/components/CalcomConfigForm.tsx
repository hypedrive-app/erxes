import { useMutation, useQuery } from '@apollo/client';
import { IconDatabase, IconServer2 } from '@tabler/icons-react';
import { Badge, Button, Input, Skeleton, toast } from 'erxes-ui';
import { useState } from 'react';

import {
  CALCOM_CONFIG_STATUS_QUERY,
  CALCOM_SET_CONFIG,
} from '~/modules/bookings/graphql/queries/config';

interface ICalcomConfigStatus {
  code: string;
  isSet: boolean;
  source: 'database' | 'environment' | 'unset';
}

/**
 * Field metadata. Kept beside the form rather than returned by the backend:
 * these are labels and help text, not data, and round-tripping them would make
 * the settings screen depend on a query for its own copy.
 */
const FIELDS: Record<
  string,
  { label: string; help: string; secret: boolean }
> = {
  CALCOM_API_KEY: {
    label: 'API key',
    help: 'Lets erxes cancel, reschedule and create bookings. Create one in Cal.com under Settings → Developer → API keys.',
    secret: true,
  },
  CALCOM_WEBHOOK_SECRET: {
    label: 'Webhook signing secret',
    help: 'Must match the secret on the Cal.com webhook exactly. A mismatch rejects every delivery, so no bookings arrive.',
    secret: true,
  },
  CALCOM_API_URL: {
    label: 'API URL',
    help: 'The v2 API base. For a self-hosted instance this is <your Cal.com>/api/v2.',
    secret: false,
  },
  CALCOM_ADMIN_TOKEN: {
    label: 'Admin token',
    help: 'Guards the reconciliation endpoint, which backfills bookings that never arrived by webhook.',
    secret: true,
  },
  CALCOM_CREATE_MISSING_CONTACTS: {
    label: 'Create contacts for unknown attendees',
    help: 'Set to true to create a CRM contact when someone books with an unrecognised email. Off by default — public booking pages are reachable by anyone.',
    secret: false,
  },
};

const SourceBadge = ({ source }: { source: ICalcomConfigStatus['source'] }) => {
  if (source === 'database') {
    return (
      <Badge variant="success">
        <IconDatabase className="w-3 h-3" />
        Set here
      </Badge>
    );
  }

  if (source === 'environment') {
    // Distinguished from "set here" because it is the difference between a
    // value the operator can change on this screen and one that needs a
    // redeploy — writing a value here overrides it.
    return (
      <Badge variant="info">
        <IconServer2 className="w-3 h-3" />
        From deployment
      </Badge>
    );
  }

  return <Badge variant="warning">Not set</Badge>;
};

const ConfigRow = ({
  status,
  onSave,
  saving,
}: {
  status: ICalcomConfigStatus;
  onSave: (code: string, value: string) => void;
  saving: boolean;
}) => {
  const meta = FIELDS[status.code];
  const [value, setValue] = useState('');

  if (!meta) return null;

  return (
    <div className="flex flex-col gap-2 border-b py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium" htmlFor={status.code}>
          {meta.label}
        </label>
        <SourceBadge source={status.source} />
      </div>

      <p className="text-sm text-muted-foreground">{meta.help}</p>

      <div className="flex gap-2">
        <Input
          id={status.code}
          // Secrets are write-only: the backend never returns them, so the
          // field starts empty and a blank submit clears the stored value
          // rather than overwriting it with nothing.
          type={meta.secret ? 'password' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            status.isSet
              ? meta.secret
                ? '•••••••• (leave blank to keep)'
                : 'Set — type to replace'
              : 'Not set'
          }
          autoComplete="off"
        />
        <Button
          variant="secondary"
          disabled={saving || !value.trim()}
          onClick={() => {
            onSave(status.code, value.trim());
            setValue('');
          }}
        >
          Save
        </Button>
        {status.source === 'database' && (
          <Button
            variant="ghost"
            disabled={saving}
            // Clearing removes the stored row so the deployment's environment
            // value applies again, rather than disabling the setting outright.
            onClick={() => onSave(status.code, '')}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Cal.com integration settings.
 *
 * Values are stored in the CRM and take precedence over the deployment
 * environment, so a leaked API key can be rotated here instead of through a
 * redeploy. Nothing is ever read back — the backend reports only whether each
 * setting is configured and from where.
 */
export const CalcomConfigForm = () => {
  const { data, loading } = useQuery<{
    calcomConfigStatus: ICalcomConfigStatus[];
  }>(CALCOM_CONFIG_STATUS_QUERY);

  const [setConfig, { loading: saving }] = useMutation(CALCOM_SET_CONFIG, {
    // Refetched rather than merged: saving changes `source`, and the badge is
    // the whole point of the screen.
    refetchQueries: [CALCOM_CONFIG_STATUS_QUERY],
  });

  const handleSave = async (code: string, value: string) => {
    try {
      await setConfig({ variables: { code, value: value || null } });

      toast({
        title: value ? 'Setting saved' : 'Setting cleared',
        description: value
          ? undefined
          : 'Falling back to the deployment environment.',
      });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {(data?.calcomConfigStatus ?? []).map((status) => (
        <ConfigRow
          key={status.code}
          status={status}
          onSave={handleSave}
          saving={saving}
        />
      ))}
    </div>
  );
};
