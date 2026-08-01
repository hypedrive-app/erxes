import { TaskDetails } from '@/task/components/detail/TaskDetails';
import { TaskDetailSheet } from '@/task/components/TaskDetailSheet';
import { lazy, Suspense } from 'react';
import { Spinner } from 'erxes-ui';
import { NotificationContent } from './contents/NotificationContent';
import { useTranslation } from 'react-i18next';

const NotificationTaskAssignment = lazy(() =>
  import('./my-inbox/components/NotificationTaskAssignment').then((m) => ({
    default: m.NotificationTaskAssignment,
  })),
);

const NotificationProjectAssignment = lazy(() =>
  import('./my-inbox/components/NotificationProjectAssignment').then((m) => ({
    default: m.NotificationProjectAssignment,
  })),
);

const ProjectDetails = lazy(() =>
  import('@/project/components/details/ProjectDetails').then((m) => ({
    default: m.ProjectDetails,
  })),
);

/**
 * Which notifications get the purpose-built assignment view.
 *
 * Matched on `action`, not on `title`. The titles these sets used to hold
 * ('Task Assigned', 'Project Assigned') come from `meta/notifications.ts`, but
 * that is only the label shown in the notification *settings* screen — the
 * title actually written onto the record comes from `getTitle()` in
 * operation_api's `utils/notifications.ts`, which returns the bare content type
 * ('Task', 'Project'). The two never matched, so every task notification fell
 * through to the full editor below instead of this view, and every project one
 * to ProjectDetails.
 *
 * `action` is the right key regardless: it is a stable enum written by the
 * backend, whereas a title is a display string and would break again the moment
 * it is translated.
 */
const ASSIGNMENT_ACTIONS = new Set(['assignee', 'status']);

const NotificationsWidgets = (props: any) => {
  const { t } = useTranslation('operation');
  const { contentTypeId, contentType, action } = props;

  const [_, moduleName, collectionType] = (contentType || '')
    .replace(':', '.')
    .split('.');

  if (moduleName === 'system' && collectionType) {
    const NotificationComponent =
      NotificationContent[collectionType as keyof typeof NotificationContent];

    if (!NotificationComponent) {
      return <div>{t('no-notification-component-found')}</div>;
    }

    return <NotificationComponent {...props} />;
  }

  if (moduleName === 'task' && ASSIGNMENT_ACTIONS.has(action)) {
    return (
      <Suspense fallback={<Spinner containerClassName="h-full" />}>
        <NotificationTaskAssignment {...props} />
      </Suspense>
    );
  }

  if (moduleName === 'project') {
    if (ASSIGNMENT_ACTIONS.has(action)) {
      return (
        <Suspense fallback={<Spinner containerClassName="h-full" />}>
          <NotificationProjectAssignment {...props} />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<Spinner containerClassName="h-full" />}>
        <ProjectDetails projectId={contentTypeId} />
      </Suspense>
    );
  }

  return (
    <>
      <TaskDetailSheet />
      <TaskDetails taskId={contentTypeId} checkTriage={true} />
    </>
  );
};

export default NotificationsWidgets;
