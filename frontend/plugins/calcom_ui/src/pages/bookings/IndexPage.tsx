import {
  IconCaretDownFilled,
  IconSandbox,
  IconSettings,
} from '@tabler/icons-react';
import { Breadcrumb, Button, Separator } from 'erxes-ui';
import { PageHeader, createFavoriteBreadcrumb } from 'ui-modules';
import { Link } from 'react-router-dom';

export const IndexPage = () => {
  // FavoriteToggleButton requires a breadcrumb; create-plugin renders it with
  // no props, which does not compile. Built the way sales_ui/PosIndexPage does.
  const favoriteBreadcrumb = createFavoriteBreadcrumb('Bookings');

  return (
    <div className="flex flex-col h-full">
      <PageHeader>
        <PageHeader.Start>
          <Breadcrumb>
            <Breadcrumb.List className="gap-1">
              <Breadcrumb.Item>
                <Button variant="ghost" asChild>
                  <Link to="/settings/bookings">
                    <IconSandbox />
                    bookings
                  </Link>
                </Button>
              </Breadcrumb.Item>
            </Breadcrumb.List>
          </Breadcrumb>
          <Separator.Inline />
          <PageHeader.FavoriteToggleButton
            breadcrumb={favoriteBreadcrumb}
            icon="IconCalendarEvent"
          />
        </PageHeader.Start>
        <PageHeader.End>
          <Button variant="outline" asChild>
            <Link to="/settings/bookings">
              <IconSettings />
              Go to settings
            </Link>
          </Button>
          <Button>
            More <IconCaretDownFilled />
          </Button>
        </PageHeader.End>
      </PageHeader>
      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden flex-auto p-6">
          <div className="rounded-lg border bg-card p-8 text-card-foreground">
            <h2 className="text-xl font-semibold mb-2">bookings</h2>
            <p className="text-muted-foreground">
              This is the bookings module. Add your content here using RecordTable, Form, and other erxes-ui components.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
