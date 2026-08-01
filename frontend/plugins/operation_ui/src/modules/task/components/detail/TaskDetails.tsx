import { TaskFields } from '@/task/components/detail/TaskFields';
import { TaskSideWidgets } from '~/widgets/relation/TaskSideWidgets';
import { TriageFields } from '@/triage/components/TriageFields';
import { useGetTask } from '@/task/hooks/useGetTask';
import { useGetTriage } from '@/triage/hooks/useGetTriage';
import { Spinner } from 'erxes-ui';
import { useTranslation } from 'react-i18next';

export const TaskDetails = ({
  taskId,
  checkTriage,
}: {
  taskId: string;
  checkTriage?: boolean;
}) => {
  const { t } = useTranslation('operation');

  const { task, loading: loadingTask } = useGetTask({
    variables: { _id: taskId },
    // Without this the query fires with `_id: undefined` and the server rejects
    // it as a missing required variable — a 400 per render, and an `error` that
    // is about the malformed request rather than about the task.
    skip: !taskId,
  });

  const { triage, loading: loadingTriage } = useGetTriage({
    variables: { _id: taskId },
    skip: !checkTriage || !taskId || loadingTask,
  });

  // A notification outlives the task it points at — nothing deletes or
  // tombstones it — so `getTask` legitimately resolves to null here. Returning
  // bare null rendered an empty pane that was indistinguishable from a loading
  // state or a broken app, which is exactly what "notifications open blank"
  // was. Loading and not-found have to be told apart before either is shown.
  if (loadingTask || loadingTriage) {
    return <Spinner containerClassName="h-full" />;
  }

  if (!task && !triage) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-1 p-6 text-center">
        <span className="font-medium">
          {t('task-unavailable', 'This task is no longer available')}
        </span>
        <span className="text-sm text-accent-foreground">
          {t(
            'task-unavailable-description',
            'It was deleted after this notification was sent.',
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex overflow-auto flex-1 lg:min-h-dvh">
      <div className="w-full xl:max-w-3xl mx-auto p-6">
        {task && <TaskFields task={task} />}
        {triage && <TriageFields triage={triage} />}
      </div>
      {task && <TaskSideWidgets contentId={task._id} />}
    </div>
  );
};
