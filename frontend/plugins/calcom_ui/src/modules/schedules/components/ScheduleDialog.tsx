import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Dialog,
  Form,
  Input,
  Switch,
  TimezoneSelect,
} from 'erxes-ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomScheduleActions } from '~/modules/schedules/hooks/useCalcomScheduleActions';
import { ICalcomSchedule } from '~/modules/schedules/types/schedule';

const WEEK_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    timeZone: z.string().trim().min(1, 'Timezone is required'),
    isDefault: z.boolean(),
    days: z.array(z.string()),
    startTime: z.string().regex(TIME_RE, 'Use HH:MM, e.g. 09:00'),
    endTime: z.string().regex(TIME_RE, 'Use HH:MM, e.g. 17:00'),
  })
  // The native time input guarantees the format above; this catches the
  // ordering mistake it cannot — Cal.com rejects an end before a start with
  // an API error that names neither field, so it is worth catching here.
  .refine((values) => values.endTime > values.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

type FormValues = z.infer<typeof schema>;

/**
 * One working-hours block across the days it applies to — the common case
 * (e.g. Mon–Fri 09:00–17:00) and what Cal.com itself defaults new schedules
 * to. Per-day different hours or date overrides are configuration Cal.com
 * supports but this dialog does not build a UI for; someone who needs that
 * can still refine it from Cal.com's own availability editor afterwards —
 * this covers the setup that would otherwise require leaving erxes at all.
 */
export const ScheduleDialog = ({
  schedule,
  open,
  onOpenChange,
}: {
  schedule?: ICalcomSchedule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { pending, createSchedule, updateSchedule } =
    useCalcomScheduleActions();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isDefault: false,
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      startTime: '09:00',
      endTime: '17:00',
    },
  });

  useEffect(() => {
    if (!open) return;

    const firstBlock = schedule?.availability?.[0];

    form.reset({
      name: schedule?.name ?? '',
      timeZone:
        schedule?.timeZone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      isDefault: schedule?.isDefault ?? false,
      days: firstBlock?.days ?? [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ],
      startTime: firstBlock?.startTime ?? '09:00',
      endTime: firstBlock?.endTime ?? '17:00',
    });
  }, [open, schedule, form]);

  const onSubmit = async (values: FormValues) => {
    const input = {
      name: values.name,
      timeZone: values.timeZone,
      isDefault: values.isDefault,
      availability: values.days.length
        ? [
            {
              days: values.days,
              startTime: values.startTime,
              endTime: values.endTime,
            },
          ]
        : [],
    };

    const ok = schedule
      ? await updateSchedule(schedule.id, input)
      : await createSchedule(input);

    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-lg">
        <Dialog.Header>
          <Dialog.Title>
            {schedule ? 'Edit schedule' : 'New schedule'}
          </Dialog.Title>
          <Dialog.Description>
            {schedule
              ? 'Changes are saved directly to Cal.com.'
              : 'Creates an availability schedule in Cal.com.'}
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
                      <Input {...field} placeholder="Working hours" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              <Form.Field
                control={form.control}
                name="timeZone"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Timezone</Form.Label>
                    <Form.Control>
                      <TimezoneSelect
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </div>

            <Form.Field
              control={form.control}
              name="days"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Active days</Form.Label>
                  <div className="flex flex-wrap gap-3">
                    {WEEK_DAYS.map((day) => (
                      <label
                        key={day}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={field.value.includes(day)}
                          onCheckedChange={(checked) => {
                            field.onChange(
                              checked
                                ? [...field.value, day]
                                : field.value.filter((d: string) => d !== day),
                            );
                          }}
                        />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Form.Field
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Start time</Form.Label>
                    {/* Native time input rather than free text: it enforces a
                        valid HH:MM by construction, so there is no format to
                        get wrong and nothing left for the regex to catch. */}
                    <Form.Control>
                      <Input {...field} type="time" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              <Form.Field
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>End time</Form.Label>
                    <Form.Control>
                      <Input {...field} type="time" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </div>

            <Form.Field
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <Form.Item className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Form.Label>Default schedule</Form.Label>
                    <p className="text-sm text-muted-foreground">
                      Used by event types that are not tied to a specific
                      schedule.
                    </p>
                  </div>
                  <Form.Control>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Form.Control>
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
                {pending ? 'Saving…' : schedule ? 'Save changes' : 'Create'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
