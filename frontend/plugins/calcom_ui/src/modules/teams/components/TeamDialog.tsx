import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Form, Input, Textarea } from 'erxes-ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomTeamActions } from '~/modules/teams/hooks/useCalcomTeamActions';
import { ICalcomTeam } from '~/modules/teams/types/team';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers and hyphens only')
    .optional(),
  bio: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

export const TeamDialog = ({
  team,
  open,
  onOpenChange,
}: {
  team?: ICalcomTeam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { pending, createTeam, updateTeam } = useCalcomTeamActions();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', bio: '' },
  });

  useEffect(() => {
    if (!open) return;

    form.reset({
      name: team?.name ?? '',
      slug: team?.slug ?? '',
      bio: team?.bio ?? '',
    });
  }, [open, team, form]);

  const onSubmit = async (values: FormValues) => {
    const ok = team
      ? await updateTeam(team.id, values)
      : await createTeam(values);

    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-lg">
        <Dialog.Header>
          <Dialog.Title>{team ? 'Edit team' : 'New team'}</Dialog.Title>
          <Dialog.Description>
            {team
              ? 'Changes are saved directly to Cal.com.'
              : 'Creates a team in Cal.com for round-robin and collective scheduling.'}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Form.Field
                control={form.control}
                name="name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Name</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="Sales team" />
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
                    <Form.Label>Slug (optional)</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="sales-team" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </div>

            <Form.Field
              control={form.control}
              name="bio"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Bio (optional)</Form.Label>
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
                {pending ? 'Saving…' : team ? 'Save changes' : 'Create'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
