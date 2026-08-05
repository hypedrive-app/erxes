import { IconClock } from '@tabler/icons-react';
import { Breadcrumb, Button, Separator } from 'erxes-ui';
import { PageHeader, createFavoriteBreadcrumb } from 'ui-modules';
import { Link } from 'react-router-dom';

import { SchedulesTable } from '~/modules/schedules/components/SchedulesTable';

export const IndexPage = () => {
  const favoriteBreadcrumb = createFavoriteBreadcrumb('Schedules');

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <PageHeader.Start>
          <Breadcrumb>
            <Breadcrumb.List className="gap-1">
              <Breadcrumb.Item>
                <Button variant="ghost" asChild>
                  <Link to="/calcom/schedules">
                    <IconClock />
                    Schedules
                  </Link>
                </Button>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb>
          <Separator.Inline />
          <PageHeader.FavoriteToggleButton
            breadcrumb={favoriteBreadcrumb}
            icon="IconClock"
          />
        </PageHeader.Start>
      </PageHeader>

      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-auto flex-auto">
          <SchedulesTable />
        </div>
      </div>
    </div>
  );
};
