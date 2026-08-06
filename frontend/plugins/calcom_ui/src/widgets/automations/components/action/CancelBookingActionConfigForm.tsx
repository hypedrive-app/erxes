import { zodResolver } from '@hookform/resolvers/zod';
import { Form, Input, Textarea } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import {
  AutomationActionFormProps,
  useAutomationRemoteFormSubmit,
} from 'ui-modules';

import {
  calcomCancelActionConfigFormSchema,
  TCalcomCancelActionConfigForm,
} from '../../states/calcomActionConfigFormDefinitions';

/**
 * Config panel for the `calcom:bookings.cancel` action.
 *
 * Both fields are optional on purpose. The handler resolves the booking as
 * `action.config.uid || execution.target.uid`, so a workflow started by any
 * booking trigger already carries the booking and this form can be left
 * entirely empty — which is the common case. The uid field exists for the
 * other one: cancelling a booking that is not the workflow's own target.
 */
export const CancelBookingActionConfigForm = ({
  formRef,
  currentAction,
  onSaveActionConfig,
}: AutomationActionFormProps<TCalcomCancelActionConfigForm>) => {
  const form = useForm<TCalcomCancelActionConfigForm>({
    resolver: zodResolver(calcomCancelActionConfigFormSchema),
    defaultValues: {
      uid: currentAction?.config?.uid || '',
      reason: currentAction?.config?.reason || '',
    },
  });

  useAutomationRemoteFormSubmit({
    formRef,
    callback: () => form.handleSubmit(onSaveActionConfig)(),
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4 p-4">
        <Form.Field
          control={form.control}
          name="uid"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>Booking uid</Form.Label>
              <Form.Control>
                <Input
                  {...field}
                  placeholder="Leave empty to cancel the booking that triggered this workflow"
                />
              </Form.Control>
              <Form.Description>
                Only needed when cancelling a booking other than the one this
                workflow is running for.
              </Form.Description>
              <Form.Message />
            </Form.Item>
          )}
        />

        <Form.Field
          control={form.control}
          name="reason"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>Cancellation reason</Form.Label>
              <Form.Control>
                <Textarea
                  {...field}
                  placeholder="Shown to the attendee in Cal.com's cancellation email"
                />
              </Form.Control>
              <Form.Message />
            </Form.Item>
          )}
        />
      </form>
    </Form>
  );
};
