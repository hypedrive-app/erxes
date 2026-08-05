import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  Form,
  Input,
  Select,
  Skeleton,
  Table,
} from 'erxes-ui';
import {
  IconAlertTriangle,
  IconDots,
  IconUserPlus,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomTeamMemberships } from '~/modules/teams/hooks/useCalcomTeamMemberships';

const ROLES = ['MEMBER', 'ADMIN', 'OWNER'] as const;

const schema = z.object({
  userId: z.coerce.number().int().positive('Enter a Cal.com user id'),
  role: z.enum(ROLES),
});

type FormValues = z.infer<typeof schema>;

/**
 * Membership is keyed on Cal.com's own numeric user id, not an erxes team
 * member — the two systems have no shared identity, and Cal.com's API has no
 * "invite by email" for existing users on this endpoint. Whoever adds a
 * member needs to already know that id from Cal.com.
 */
const AddMemberDialog = ({
  open,
  onOpenChange,
  onAdd,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (userId: number, role: string) => Promise<boolean>;
  pending: boolean;
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { userId: undefined, role: 'MEMBER' },
  });

  const onSubmit = async (values: FormValues) => {
    const ok = await onAdd(values.userId, values.role);
    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-sm">
        <Dialog.Header>
          <Dialog.Title>Add team member</Dialog.Title>
          <Dialog.Description>
            Uses the member's Cal.com user id — find it on their profile in
            Cal.com.
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Form.Field
              control={form.control}
              name="userId"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Cal.com user id</Form.Label>
                  <Form.Control>
                    <Input {...field} type="number" min={1} />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="role"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Role</Form.Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <Form.Control>
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                    </Form.Control>
                    <Select.Content>
                      {ROLES.map((role) => (
                        <Select.Item key={role} value={role}>
                          {role}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
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
                {pending ? 'Adding…' : 'Add'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};

export const TeamMembersSection = ({ teamId }: { teamId: number }) => {
  const {
    memberships,
    loading,
    error,
    pending,
    addMember,
    updateMember,
    removeMember,
  } = useCalcomTeamMemberships(teamId);
  const [addOpen, setAddOpen] = useState(false);

  if (loading && !memberships.length) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (error && !memberships.length) {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle />
        <Alert.Title>Could not load members</Alert.Title>
        <Alert.Description>{error.message}</Alert.Description>
      </Alert>
    );
  }

  return (
    <div>
      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={addMember}
        pending={pending}
      />

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">Members</h3>
        <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
          <IconUserPlus />
          Add member
        </Button>
      </div>

      {!memberships.length ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>User id</Table.Head>
              <Table.Head>Role</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head className="w-12" />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {memberships.map((membership) => (
              <Table.Row key={membership.id}>
                <Table.Cell className="font-medium">
                  {membership.userId}
                </Table.Cell>
                <Table.Cell>{membership.role}</Table.Cell>
                <Table.Cell>
                  <Badge variant={membership.accepted ? 'success' : 'warning'}>
                    {membership.accepted ? 'Accepted' : 'Pending'}
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
                      {ROLES.filter((role) => role !== membership.role).map(
                        (role) => (
                          <DropdownMenu.Item
                            key={role}
                            onClick={() => updateMember(membership.id, role)}
                          >
                            Make {role.toLowerCase()}
                          </DropdownMenu.Item>
                        ),
                      )}
                      <DropdownMenu.Item
                        className="text-destructive"
                        onClick={() => removeMember(membership.id)}
                      >
                        Remove
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
