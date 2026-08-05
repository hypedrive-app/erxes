import {
  Alert,
  Badge,
  Button,
  DropdownMenu,
  Skeleton,
  Table,
} from 'erxes-ui';
import { IconAlertTriangle, IconClock, IconDots } from '@tabler/icons-react';
import { useState } from 'react';

import { DeleteScheduleAlert } from '~/modules/schedules/components/DeleteScheduleAlert';
import { ScheduleDialog } from '~/modules/schedules/components/ScheduleDialog';
import { useCalcomSchedulesList } from '~/modules/schedules/hooks/useCalcomSchedulesList';
import { ICalcomSchedule } from '~/modules/schedules/types/schedule';

const summarizeAvailability = (schedule: ICalcomSchedule) => {
  const block = schedule.availability?.[0];
  if (!block) return 'No availability set';

  const days = block.days.map((d) => d.slice(0, 3)).join(', ');
  return `${days} · ${block.startTime}–${block.endTime}`;
};

export const SchedulesTable = () => {
  const { schedules, loading, error } = useCalcomSchedulesList();
  const [editTarget, setEditTarget] = useState<ICalcomSchedule>();
  const [deleteTarget, setDeleteTarget] = useState<ICalcomSchedule>();
  const [createOpen, setCreateOpen] = useState(false);

  if (loading && !schedules.length) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error && !schedules.length) {
    return (
      <div className="p-3">
        <Alert variant="destructive">
          <IconAlertTriangle />
          <Alert.Title>Could not load schedules</Alert.Title>
          <Alert.Description>
            {error.message} — check the Cal.com connection in settings.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <ScheduleDialog
        schedule={editTarget}
        open={!!editTarget}
        onOpenChange={(next) => !next && setEditTarget(undefined)}
      />
      <ScheduleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteScheduleAlert
        schedule={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
      />

      <div className="flex justify-end p-3 pb-0">
        <Button onClick={() => setCreateOpen(true)}>
          <IconClock />
          New schedule
        </Button>
      </div>

      {!schedules.length ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <IconClock size={48} className="text-muted-foreground" />
          <h3 className="mt-6 text-lg font-semibold">No schedules yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one to control when event types can be booked.
          </p>
        </div>
      ) : (
        <div className="p-3">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Name</Table.Head>
                <Table.Head>Timezone</Table.Head>
                <Table.Head>Availability</Table.Head>
                <Table.Head>Default</Table.Head>
                <Table.Head className="w-12" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {schedules.map((schedule) => (
                <Table.Row key={schedule.id}>
                  <Table.Cell className="font-medium">
                    {schedule.name}
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground">
                    {schedule.timeZone}
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground">
                    {summarizeAvailability(schedule)}
                  </Table.Cell>
                  <Table.Cell>
                    {schedule.isDefault && (
                      <Badge variant="success">Default</Badge>
                    )}
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
                          onClick={() => setEditTarget(schedule)}
                        >
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          className="text-destructive"
                          onClick={() => setDeleteTarget(schedule)}
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
