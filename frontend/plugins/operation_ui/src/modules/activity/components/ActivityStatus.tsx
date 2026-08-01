import { useActivityListContext } from '@/activity/context/ActivityListContext';
import { IActivity } from '@/activity/types';
import { ITask } from '@/task/types';
import { IProject } from '@/project/types';
import { ITriage } from '@/triage/types/triage';
import { useGetStatusByTeam } from '@/task/hooks/useGetStatusByTeam';
import { Badge } from 'erxes-ui';
import {
  StatusInlineIcon,
  StatusInlineLabel,
} from '@/operation/components/StatusInline';
import { useTranslation } from 'react-i18next';

// Tasks resolve their status against the team's configured statuses, so they
// need a distinct branch. ITriage also carries `teamId` but, like IProject,
// stores a numeric status, so `projectId` is what separates a task.
const isTask = (
  content: ITask | IProject | ITriage | null,
): content is ITask => {
  return !!content && 'teamId' in content && 'projectId' in content;
};

export const ActivityStatus = ({
  metadata,
}: {
  metadata: IActivity['metadata'];
}) => {
  const { t } = useTranslation('operation');
  const { previousValue, newValue } = metadata;
  const contentDetail = useActivityListContext();

  const { statuses } = useGetStatusByTeam({
    variables: { teamId: isTask(contentDetail) ? contentDetail.teamId : '' },
    skip: !isTask(contentDetail),
  });

  const getTaskStatus = (value?: string) => {
    return statuses?.find((status) => status.value === value);
  };

  const renderStatusBadge = (value?: string) => {
    if (isTask(contentDetail)) {
      const status = getTaskStatus(value);
      return (
        <Badge variant="secondary" className="capitalize">
          <StatusInlineIcon
            statusType={status?.type as number}
            color={status?.color}
          />
          {status?.label}
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="capitalize">
          <StatusInlineIcon statusType={value} />
          <StatusInlineLabel statusType={value} />
        </Badge>
      );
    }
  };

  return (
    <div className="flex items-center gap-1">
      {t('changed-status')}
      {renderStatusBadge(previousValue)}
      {t('to')}
      {renderStatusBadge(newValue)}
    </div>
  );
};
