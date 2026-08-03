import {
  IconCalendarPlus,
  IconSandbox,
  IconSettings,
} from '@tabler/icons-react';
import { Breadcrumb, Button, Separator } from 'erxes-ui';
import { PageHeader, createFavoriteBreadcrumb } from 'ui-modules';
import { Link } from 'react-router-dom';

import { useState } from 'react';

import { BookingsRecordTable } from '~/modules/bookings/components/BookingsRecordTable';
import { CreateBookingDialog } from '~/modules/bookings/components/CreateBookingDialog';

export const IndexPage = () => {
  // FavoriteToggleButton requires a breadcrumb; create-plugin renders it with
  // no props, which does not compile. Built the way sales_ui/PosIndexPage does.
  const favoriteBreadcrumb = createFavoriteBreadcrumb('Bookings');

  const [createOpen, setCreateOpen] = useState(false);

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
          {/* Replaces the generator's inert "More" dropdown, which opened
              nothing. A header action should do something. */}
          <Button onClick={() => setCreateOpen(true)}>
            <IconCalendarPlus />
            Book a time
          </Button>
        </PageHeader.End>
      </PageHeader>
      {/* No customerId: a booking made from the list is not tied to a contact
          up front, so the attendee is entered by hand and the mirror links it
          by email the usual way once the webhook arrives. */}
      <CreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} />

      <div className="flex h-full overflow-hidden">
        <div className="flex flex-col h-full overflow-hidden flex-auto">
          <BookingsRecordTable />
        </div>
      </div>
    </div>
  );
};
