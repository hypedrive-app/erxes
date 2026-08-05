import { Alert, Button, DropdownMenu, Skeleton, Table } from 'erxes-ui';
import {
  IconAlertTriangle,
  IconDots,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeleteTeamAlert } from '~/modules/teams/components/DeleteTeamAlert';
import { TeamDialog } from '~/modules/teams/components/TeamDialog';
import { useCalcomTeamsList } from '~/modules/teams/hooks/useCalcomTeamsList';
import { ICalcomTeam } from '~/modules/teams/types/team';

export const TeamsTable = () => {
  const { teams, loading, error } = useCalcomTeamsList();
  const navigate = useNavigate();
  const [editTarget, setEditTarget] = useState<ICalcomTeam>();
  const [deleteTarget, setDeleteTarget] = useState<ICalcomTeam>();
  const [createOpen, setCreateOpen] = useState(false);

  if (loading && !teams.length) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error && !teams.length) {
    return (
      <div className="p-3">
        <Alert variant="destructive">
          <IconAlertTriangle />
          <Alert.Title>Could not load teams</Alert.Title>
          <Alert.Description>
            {error.message} — check the Cal.com connection in settings.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <TeamDialog
        team={editTarget}
        open={!!editTarget}
        onOpenChange={(next) => !next && setEditTarget(undefined)}
      />
      <TeamDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteTeamAlert
        team={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
      />

      <div className="flex justify-end p-3 pb-0">
        <Button onClick={() => setCreateOpen(true)}>
          <IconUsersGroup />
          New team
        </Button>
      </div>

      {!teams.length ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <IconUsersGroup size={48} className="text-muted-foreground" />
          <h3 className="mt-6 text-lg font-semibold">No teams yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to set up round-robin or collective scheduling.
          </p>
        </div>
      ) : (
        <div className="p-3">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Name</Table.Head>
                <Table.Head>Slug</Table.Head>
                <Table.Head>Bio</Table.Head>
                <Table.Head className="w-12" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {teams.map((team) => (
                <Table.Row
                  key={team.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="link"
                  onClick={() => navigate(`/calcom/teams/${team.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/calcom/teams/${team.id}`);
                    }
                  }}
                >
                  <Table.Cell className="font-medium">{team.name}</Table.Cell>
                  <Table.Cell className="text-muted-foreground">
                    {team.slug || '—'}
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground truncate max-w-xs">
                    {team.bio || '—'}
                  </Table.Cell>
                  <Table.Cell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenu.Trigger asChild>
                        <Button variant="ghost" size="icon">
                          <IconDots />
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item
                          onClick={() => navigate(`/calcom/teams/${team.id}`)}
                        >
                          Manage
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onClick={() => setEditTarget(team)}>
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="text-destructive"
                          onClick={() => setDeleteTarget(team)}
                        >
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </>
  );
};
