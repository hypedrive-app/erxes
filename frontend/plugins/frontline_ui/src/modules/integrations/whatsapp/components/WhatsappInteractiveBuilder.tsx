import { zodResolver } from '@hookform/resolvers/zod';
import {
  IconPlus,
  IconSend,
  IconSquareRoundedChevronsDown,
  IconTrash,
} from '@tabler/icons-react';
import {
  Button,
  Dialog,
  Form,
  Input,
  Spinner,
  Textarea,
  toast,
} from 'erxes-ui';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useConversationContext } from '@/inbox/conversations/hooks/useConversationContext';
import { useConversationMessageAdd } from '@/inbox/conversations/conversation-detail/hooks/useConversationMessageAdd';

/**
 * Meta's own caps, enforced here so the agent is stopped while composing rather
 * than after a rejected round trip that loses what they typed.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
 */
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_BODY = 1024;
const MAX_FOOTER = 60;

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'A message body is required')
    .max(MAX_BODY, `Body must be ${MAX_BODY} characters or fewer`),
  footer: z
    .string()
    .trim()
    .max(MAX_FOOTER, `Footer must be ${MAX_FOOTER} characters or fewer`)
    .optional(),
  buttons: z
    .array(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, 'Button text is required')
          .max(
            MAX_BUTTON_TITLE,
            `Buttons must be ${MAX_BUTTON_TITLE} characters or fewer`,
          ),
      }),
    )
    .min(1, 'Add at least one button')
    .max(MAX_BUTTONS, `WhatsApp allows at most ${MAX_BUTTONS} buttons`)
    // Meta rejects duplicate titles outright, and two identical buttons would
    // be indistinguishable to the customer anyway.
    .refine(
      (buttons) =>
        new Set(buttons.map((b) => b.title.trim().toLowerCase())).size ===
        buttons.length,
      { message: 'Each button needs different text' },
    ),
});

type TFormValues = z.infer<typeof schema>;

/**
 * Composes a reply-buttons message.
 *
 * Only the button form is offered, not lists or CTA URLs. Buttons are what a
 * support agent reaches for — a closed question answered in one tap — while a
 * ten-row list is a menu that belongs in an automation, and a CTA URL is a link
 * that plain text already carries. The backend accepts all three, so adding a
 * surface for the others later needs no API work.
 *
 * Dispatched on `extraInfo.whatsappInteractive`, the same envelope the template
 * picker uses, so no new mutation is involved.
 */
export const WhatsappInteractiveBuilder = () => {
  const { t } = useTranslation('frontline');
  const { _id: conversationId } = useConversationContext();
  const { addConversationMessage, loading: sending } =
    useConversationMessageAdd();
  const [open, setOpen] = useState(false);

  const form = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { body: '', footer: '', buttons: [{ title: '' }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'buttons',
  });

  const onSubmit = (values: TFormValues) => {
    addConversationMessage({
      variables: {
        conversationId,
        // The body is stored as the message content so the thread shows what
        // the customer saw; the buttons themselves are appended so the agent
        // can tell one prompt from another at a glance.
        content: `${values.body}\n\n[${values.buttons
          .map((b) => b.title)
          .join('] [')}]`,
        internal: false,
        extraInfo: {
          whatsappInteractive: {
            type: 'button',
            body: { text: values.body },
            ...(values.footer ? { footer: { text: values.footer } } : {}),
            action: {
              buttons: values.buttons.map((button, index) => ({
                type: 'reply',
                // The id comes back on the webhook when the customer taps, and
                // is what an automation would branch on. Positional because the
                // agent has no reason to invent identifiers.
                reply: { id: `btn_${index + 1}`, title: button.title },
              })),
            },
          },
        },
      },
      onCompleted: () => {
        toast({ title: t('whatsapp-interactive-sent') });
        form.reset({ body: '', footer: '', buttons: [{ title: '' }] });
        setOpen(false);
      },
      onError: (error) =>
        toast({ title: error.message, variant: 'destructive' }),
      refetchQueries: ['Conversations', 'ConversationMessages'],
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('whatsapp-interactive-open')}
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconSquareRoundedChevronsDown className="h-4 w-4" />
        </Button>
      </Dialog.Trigger>

      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{t('whatsapp-interactive-title')}</Dialog.Title>
          <Dialog.Description>
            {t('whatsapp-interactive-description')}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <Form.Field
              control={form.control}
              name="body"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-interactive-body')}</Form.Label>
                  <Form.Control>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder={t('whatsapp-interactive-body-placeholder')}
                    />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <div className="flex flex-col gap-2">
              <Form.Label>{t('whatsapp-interactive-buttons')}</Form.Label>

              {fields.map((item, index) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Form.Field
                    control={form.control}
                    name={`buttons.${index}.title`}
                    render={({ field }) => (
                      <Form.Item className="flex-1">
                        <Form.Control>
                          <Input
                            {...field}
                            maxLength={MAX_BUTTON_TITLE}
                            placeholder={t(
                              'whatsapp-interactive-button-placeholder',
                            )}
                          />
                        </Form.Control>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />
                  {/* The last remaining button cannot be removed — a message
                      with none of them is not an interactive message. */}
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <IconTrash />
                    </Button>
                  )}
                </div>
              ))}

              {fields.length < MAX_BUTTONS && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => append({ title: '' })}
                >
                  <IconPlus />
                  {t('whatsapp-interactive-add-button')}
                </Button>
              )}

              {/* Array-level errors (duplicate titles) attach to the array
                  itself rather than to any one field, so no `Form.Message`
                  above would ever show them. */}
              {!!form.formState.errors.buttons?.message && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.buttons.message}
                </p>
              )}
            </div>

            <Form.Field
              control={form.control}
              name="footer"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-interactive-footer')}</Form.Label>
                  <Form.Control>
                    <Input {...field} maxLength={MAX_FOOTER} />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Dialog.Footer>
              <Button type="submit" disabled={sending}>
                {sending ? <Spinner size="sm" /> : <IconSend />}
                {t('whatsapp-interactive-send')}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
