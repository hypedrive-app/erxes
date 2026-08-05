import { IconUsersGroup } from '@tabler/icons-react';
import { Breadcrumb, Button, Separator } from 'erxes-ui';
import { PageHeader, createFavoriteBreadcrumb } from 'ui-modules';
import { Link } from 'react-router-dom';

import { TeamsTable } from '~/modules/teams/components/TeamsTable';

export const IndexPage = () => {
  const favoriteBreadcrumb = createFavoriteBreadcrumb('Teams');

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <PageHeader.Start>
          <Breadcrumb>
            <Breadcrumb.List className="gap-1">
              <Breadcrumb.Item>
                <Button variant="ghost" asChild>
                  <Link to="/calcom/teams">
                    <IconUsersGroup />
                    Teams
                  </Link>
                </Button>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb>
          <Separator.Inline />
          <PageHeader.FavoriteToggleButton
            breadcrumb={favoriteBreadcrumb}
            icon="IconUsersGroup"
          />
        </PageHeader.Start>
      </PageHeader>

      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-auto flex-auto">
          <TeamsTable />
        </div>
      </div>
    </div>
  );
};
