import { IconCalendarCog } from '@tabler/icons-react';
import { Breadcrumb, Button, Separator } from 'erxes-ui';
import { PageHeader, createFavoriteBreadcrumb } from 'ui-modules';
import { Link } from 'react-router-dom';

import { EventTypesTable } from '~/modules/eventTypes/components/EventTypesTable';

export const IndexPage = () => {
  const favoriteBreadcrumb = createFavoriteBreadcrumb('Event types');

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <PageHeader.Start>
          <Breadcrumb>
            <Breadcrumb.List className="gap-1">
              <Breadcrumb.Item>
                <Button variant="ghost" asChild>
                  <Link to="/calcom/event-types">
                    <IconCalendarCog />
                    Event types
                  </Link>
                </Button>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb>
          <Separator.Inline />
          <PageHeader.FavoriteToggleButton
            breadcrumb={favoriteBreadcrumb}
            icon="IconCalendarCog"
          />
        </PageHeader.Start>
      </PageHeader>

      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-auto flex-auto">
          <EventTypesTable />
        </div>
      </div>
    </div>
  );
};
