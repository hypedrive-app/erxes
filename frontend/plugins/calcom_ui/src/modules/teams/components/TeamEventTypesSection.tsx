import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  Form,
  Input,
  Skeleton,
  Table,
  Textarea,
} from 'erxes-ui';
import {
  IconAlertTriangle,
  IconCalendarPlus,
  IconDots,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomTeamEventTypes } from '~/modules/teams/hooks/useCalcomTeamEventTypes';
import { ICalcomTeamEventType } from '~/modules/teams/types/team';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  lengthInMinutes: z.coerce.number().int().positive('Must be at least 1 minute'),
  description: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

const CreateTeamEventTypeDialog = ({
  open,
  onOpenChange,
  onCreate,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: FormValues) => Promise<boolean>;
  pending: boolean;
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', slug: '', lengthInMinutes: 30, description: '' },
  });

  const onSubmit = async (values: FormValues) => {
    const ok = await onCreate(values);
    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-lg">
        <Dialog.Header>
          <Dialog.Title>New team event type</Dialog.Title>
          <Dialog.Description>
            Round-robin among the team's members by default in Cal.com.
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Form.Field
                control={form.control}
                name="title"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Title</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="Sales call" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              <Form.Field
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Slug</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="sales-call" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </div>

            <Form.Field
              control={form.control}
              name="lengthInMinutes"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Duration (minutes)</Form.Label>
                  <Form.Control>
                    <Input {...field} type="number" min={1} />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="description"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Description (optional)</Form.Label>
                  <Form.Control>
                    <Textarea {...field} rows={3} />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'Creating…' : 'Create'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};

export const TeamEventTypesSection = ({ teamId }: { teamId: number }) => {
  const {
    teamEventTypes,
    loading,
    error,
    pending,
    createTeamEventType,
    deleteTeamEventType,
  } = useCalcomTeamEventTypes(teamId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ICalcomTeamEventType>();

  if (loading && !teamEventTypes.length) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (error && !teamEventTypes.length) {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle />
        <Alert.Title>Could not load team event types</Alert.Title>
        <Alert.Description>{error.message}</Alert.Description>
      </Alert>
    );
  }

  return (
    <div>
      <CreateTeamEventTypeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createTeamEventType}
        pending={pending}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(next) => !next && setDeleteTarget(undefined)}
      >
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Delete team event type</AlertDialog.Title>
            <AlertDialog.Description>
              {deleteTarget
                ? `“${deleteTarget.title}” will be deleted from Cal.com.`
                : 'This team event type will be deleted from Cal.com.'}
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel disabled={pending}>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={pending}
              onClick={() =>
                deleteTarget && deleteTeamEventType(deleteTarget.id)
              }
            >
              {pending ? 'Deleting…' : 'Delete'}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">Team event types</h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCreateOpen(true)}
        >
          <IconCalendarPlus />
          New event type
        </Button>
      </div>

      {!teamEventTypes.length ? (
        <p className="text-sm text-muted-foreground">
          No team event types yet.
        </p>
      ) : (
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
            {teamEventTypes.map((eventType) => (
              <Table.Row key={eventType.id}>
                <Table.Cell className="font-medium">
                  {eventType.title}
                </Table.Cell>
                <Table.Cell className="text-muted-foreground">
                  {eventType.slug}
                </Table.Cell>
                <Table.Cell>
                  {eventType.lengthInMinutes
                    ? `${eventType.lengthInMinutes} min`
                    : '—'}
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
      )}
    </div>
  );
};
