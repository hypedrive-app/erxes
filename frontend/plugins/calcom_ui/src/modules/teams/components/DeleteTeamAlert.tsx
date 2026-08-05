import { AlertDialog } from 'erxes-ui';

import { useCalcomTeamActions } from '~/modules/teams/hooks/useCalcomTeamActions';
import { ICalcomTeam } from '~/modules/teams/types/team';

export const DeleteTeamAlert = ({
  team,
  open,
  onOpenChange,
}: {
  team?: ICalcomTeam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { pending, deleteTeam } = useCalcomTeamActions();

  const onConfirm = async () => {
    if (!team) return;

    const ok = await deleteTeam(team.id);
    if (ok) onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Delete team</AlertDialog.Title>
          <AlertDialog.Description>
            {team
              ? `“${team.name}” and its team event types will be deleted from Cal.com. This cannot be undone.`
              : 'This team will be deleted from Cal.com.'}
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
