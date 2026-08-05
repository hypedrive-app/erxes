import { AlertDialog } from 'erxes-ui';

import { useCalcomEventTypeActions } from '~/modules/eventTypes/hooks/useCalcomEventTypeActions';
import { ICalcomEventTypeListItem } from '~/modules/eventTypes/types/eventType';

export const DeleteEventTypeAlert = ({
  eventType,
  open,
  onOpenChange,
}: {
  eventType?: ICalcomEventTypeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { pending, deleteEventType } = useCalcomEventTypeActions();

  const onConfirm = async () => {
    if (!eventType) return;

    const ok = await deleteEventType(eventType.id);
    if (ok) onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Delete event type</AlertDialog.Title>
          <AlertDialog.Description>
            {eventType
              ? `“${eventType.title}” will be deleted from Cal.com. Existing bookings against it are not affected, but it can no longer be booked.`
              : 'This event type will be deleted from Cal.com.'}
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
