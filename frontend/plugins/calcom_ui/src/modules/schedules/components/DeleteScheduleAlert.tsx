import { AlertDialog } from 'erxes-ui';

import { useCalcomScheduleActions } from '~/modules/schedules/hooks/useCalcomScheduleActions';
import { ICalcomSchedule } from '~/modules/schedules/types/schedule';

export const DeleteScheduleAlert = ({
  schedule,
  open,
  onOpenChange,
}: {
  schedule?: ICalcomSchedule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { pending, deleteSchedule } = useCalcomScheduleActions();

  const onConfirm = async () => {
    if (!schedule) return;

    const ok = await deleteSchedule(schedule.id);
    if (ok) onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Delete schedule</AlertDialog.Title>
          <AlertDialog.Description>
            {schedule
              ? `“${schedule.name}” will be deleted from Cal.com. Event types using it as their default will fall back to Cal.com's default schedule.`
              : 'This schedule will be deleted from Cal.com.'}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={pending}>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action disabled={pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : 'Delete'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
  );
};
