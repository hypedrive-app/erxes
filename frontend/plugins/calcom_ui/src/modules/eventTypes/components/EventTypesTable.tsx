import {
  Alert,
  Badge,
  Button,
  DropdownMenu,
  Skeleton,
  Table,
} from 'erxes-ui';
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconDots,
} from '@tabler/icons-react';
import { useState } from 'react';

import { DeleteEventTypeAlert } from '~/modules/eventTypes/components/DeleteEventTypeAlert';
import { EventTypeDialog } from '~/modules/eventTypes/components/EventTypeDialog';
import { useCalcomEventTypesList } from '~/modules/eventTypes/hooks/useCalcomEventTypesList';
import { ICalcomEventTypeListItem } from '~/modules/eventTypes/types/eventType';

export const EventTypesTable = () => {
  const { eventTypes, loading, error } = useCalcomEventTypesList();
  const [editTarget, setEditTarget] = useState<ICalcomEventTypeListItem>();
  const [deleteTarget, setDeleteTarget] = useState<ICalcomEventTypeListItem>();
  const [createOpen, setCreateOpen] = useState(false);

  if (loading && !eventTypes.length) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  // Shown ahead of the empty state on purpose: an unconfigured or rejected
  // API key also resolves to zero rows, and "no event types yet" would send
  // someone looking for a create button instead of their Cal.com settings.
  if (error && !eventTypes.length) {
    return (
      <div className="p-3">
        <Alert variant="destructive">
          <IconAlertTriangle />
          <Alert.Title>Could not load event types</Alert.Title>
          <Alert.Description>
            {error.message} — check the Cal.com connection in settings.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <EventTypeDialog
        eventType={editTarget}
        open={!!editTarget}
        onOpenChange={(next) => !next && setEditTarget(undefined)}
      />
      <EventTypeDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteEventTypeAlert
        eventType={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
      />

      <div className="flex justify-end p-3 pb-0">
        <Button onClick={() => setCreateOpen(true)}>
          <IconCalendarEvent />
          New event type
        </Button>
      </div>

      {!eventTypes.length ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <IconCalendarEvent size={48} className="text-muted-foreground" />
          <h3 className="mt-6 text-lg font-semibold">No event types yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to let people book time against it.
          </p>
        </div>
      ) : (
        <div className="p-3">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Title</Table.Head>
                <Table.Head>Slug</Table.Head>
                <Table.Head>Duration</Table.Head>
                <Table.Head>Visibility</Table.Head>
                <Table.Head className="w-12" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {eventTypes.map((eventType) => (
                <Table.Row key={eventType.id}>
                  <Table.Cell className="font-medium">
                    {eventType.title}
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground">
                    {eventType.slug}
                  </Table.Cell>
                  <Table.Cell>
                    {eventType.length ? `${eventType.length} min` : '—'}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={eventType.hidden ? 'secondary' : 'success'}>
                      {eventType.hidden ? 'Hidden' : 'Visible'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <DropdownMenu>
                      <DropdownMenu.Trigger asChild>
                        <Button variant="ghost" size="icon">
                          <IconDots />
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item
                          onClick={() => setEditTarget(eventType)}
                        >
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="text-destructive"
                          onClick={() => setDeleteTarget(eventType)}
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
