import { IconArrowLeft, IconUsersGroup } from '@tabler/icons-react';
import { Breadcrumb, Button, Separator, Skeleton } from 'erxes-ui';
import { PageHeader } from 'ui-modules';
import { Link, useParams } from 'react-router-dom';

import { TeamEventTypesSection } from '~/modules/teams/components/TeamEventTypesSection';
import { TeamMembersSection } from '~/modules/teams/components/TeamMembersSection';
import { useCalcomTeamsList } from '~/modules/teams/hooks/useCalcomTeamsList';

export const DetailPage = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const id = Number(teamId);

  // Reuses the list query rather than a dedicated one-team query: the list is
  // already small (an org's teams, not its bookings) and is very likely
  // already cached from the page the user just came from.
  const { teams, loading } = useCalcomTeamsList();
  const team = teams.find((t) => t.id === id);

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <PageHeader.Start>
          <Breadcrumb>
            <Breadcrumb.List className="gap-1">
              <Breadcrumb.Item>
                <Button variant="ghost" asChild>
                  <Link to="/calcom/teams">
                    <IconArrowLeft />
                    Teams
                  </Link>
                </Button>
              </Breadcrumb.Item>
              <Breadcrumb.Separator />
              <Breadcrumb.Item>
                <IconUsersGroup className="size-4" />
                {loading && !team ? 'Loading…' : team?.name ?? 'Team'}
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb>
        </PageHeader.Start>
      </PageHeader>

      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-auto flex-auto p-6 gap-8">
          {loading && !team ? (
            <Skeleton className="h-64 w-full" />
          ) : !team ? (
            <p className="text-sm text-muted-foreground">Team not found.</p>
          ) : (
            <>
              <TeamMembersSection teamId={team.id} />
              <Separator />
              <TeamEventTypesSection teamId={team.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
