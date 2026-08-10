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
  Select,
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
const MAX_LIST_ROWS = 10;
const MAX_ROW_TITLE = 24;
const MAX_ROW_DESCRIPTION = 72;
const MAX_LIST_OPENER = 20;

/**
 * One schema per interactive type, so the fields a type does not use are never
 * validated against it — a list has no buttons to check and a CTA URL has no
 * rows, and a single flat schema would have to make every one of them optional
 * and then re-check them by hand.
 */
const bodyAndFooter = {
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
};

const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('button'),
    ...bodyAndFooter,
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
      // Meta rejects duplicate titles outright, and two identical buttons
      // would be indistinguishable to the customer anyway.
      .refine(
        (buttons) =>
          new Set(buttons.map((b) => b.title.trim().toLowerCase())).size ===
          buttons.length,
        { message: 'Each button needs different text' },
      ),
  }),
  z.object({
    type: z.literal('list'),
    ...bodyAndFooter,
    // The label on the button that opens the list, not a row.
    opener: z
      .string()
      .trim()
      .min(1, 'The list button needs a label')
      .max(
        MAX_LIST_OPENER,
        `The list button must be ${MAX_LIST_OPENER} characters or fewer`,
      ),
    rows: z
      .array(
        z.object({
          title: z
            .string()
            .trim()
            .min(1, 'Each row needs a title')
            .max(
              MAX_ROW_TITLE,
              `Row titles must be ${MAX_ROW_TITLE} characters or fewer`,
            ),
          description: z
            .string()
            .trim()
            .max(
              MAX_ROW_DESCRIPTION,
              `Row descriptions must be ${MAX_ROW_DESCRIPTION} characters or fewer`,
            )
            .optional(),
        }),
      )
      .min(1, 'Add at least one row')
      // 10 rows in TOTAL across every section, not 10 per section. Only one
      // section is offered here, so the two are the same number.
      .max(MAX_LIST_ROWS, `A list holds at most ${MAX_LIST_ROWS} rows`)
      .refine(
        (rows) =>
          new Set(rows.map((r) => r.title.trim().toLowerCase())).size ===
          rows.length,
        { message: 'Each row needs a different title' },
      ),
  }),
  z.object({
    type: z.literal('cta_url'),
    ...bodyAndFooter,
    displayText: z
      .string()
      .trim()
      .min(1, 'The button needs a label')
      .max(
        MAX_BUTTON_TITLE,
        `The button must be ${MAX_BUTTON_TITLE} characters or fewer`,
      ),
    // Meta requires an absolute http(s) URL and rejects anything else, so a
    // bare domain is caught here rather than at send.
    url: z
      .string()
      .trim()
      .url('Enter a full URL, including https://')
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'The link must start with http:// or https://',
      }),
  }),
]);

type TFormValues = z.infer<typeof schema>;

/** The defaults each type starts from when the agent switches to it. */
const EMPTY: Record<TFormValues['type'], TFormValues> = {
  button: { type: 'button', body: '', footer: '', buttons: [{ title: '' }] },
  list: {
    type: 'list',
    body: '',
    footer: '',
    opener: '',
    rows: [{ title: '', description: '' }],
  },
  cta_url: { type: 'cta_url', body: '', footer: '', displayText: '', url: '' },
};

/**
 * Builds the payload and the thread's own copy of it.
 *
 * The two are produced together because they have to agree: `content` is what
 * the agent sees in the thread afterwards, and a bubble showing only the body
 * would make two prompts that differ solely in their buttons indistinguishable.
 */
const buildDispatch = (values: TFormValues) => {
  const shared = {
    body: { text: values.body },
    ...(values.footer ? { footer: { text: values.footer } } : {}),
  };

  if (values.type === 'button') {
    return {
      content: `${values.body}\n\n[${values.buttons
        .map((button) => button.title)
        .join('] [')}]`,
      interactive: {
        type: 'button',
        ...shared,
        action: {
          buttons: values.buttons.map((button, index) => ({
            type: 'reply',
            // The id comes back on the webhook when the customer taps, and is
            // what an automation would branch on. Positional because the agent
            // has no reason to invent identifiers.
            reply: { id: `btn_${index + 1}`, title: button.title },
          })),
        },
      },
    };
  }

  if (values.type === 'list') {
    return {
      content: `${values.body}\n\n[${values.opener}: ${values.rows
        .map((row) => row.title)
        .join(', ')}]`,
      interactive: {
        type: 'list',
        ...shared,
        action: {
          button: values.opener,
          // One section. Meta allows several, but a section header is only
          // worth its space once there are enough rows to group, and ten is
          // the ceiling across all of them.
          sections: [
            {
              rows: values.rows.map((row, index) => ({
                id: `row_${index + 1}`,
                title: row.title,
                ...(row.description ? { description: row.description } : {}),
              })),
            },
          ],
        },
      },
    };
  }

  return {
    content: `${values.body}\n\n[${values.displayText}: ${values.url}]`,
    interactive: {
      type: 'cta_url',
      ...shared,
      action: {
        name: 'cta_url',
        parameters: {
          display_text: values.displayText,
          url: values.url,
        },
      },
    },
  };
};

/**
 * Composes an interactive message: reply buttons, a list menu, or a link
 * button.
 *
 * All three are what WhatsApp offers in place of asking the customer to type —
 * buttons for a closed question, a list for a menu too long for three buttons,
 * and a CTA URL for a link that renders as a button rather than raw text.
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
    defaultValues: EMPTY.button,
  });

  const type = form.watch('type');

  /**
   * Array-level errors (too many, duplicate titles) attach to the array itself
   * rather than to any one field, so no `Form.Message` inside the list would
   * ever render them.
   *
   * Read through a narrowed view because `errors` is typed against the union
   * of all three variants, where neither `buttons` nor `rows` exists on every
   * member. The cast is to the error shape only — not to the form values — so
   * a renamed field still fails to compile at the `name=` props above.
   */
  const arrayError = (
    form.formState.errors as {
      buttons?: { message?: string };
      rows?: { message?: string };
    }
  )[type === 'list' ? 'rows' : 'buttons']?.message;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    // Only ever read while `type` is 'button'; the list has its own array
    // below. RHF tolerates the name being absent from the current values.
    name: 'buttons' as never,
  });

  const {
    fields: rowFields,
    append: appendRow,
    remove: removeRow,
  } = useFieldArray({
    control: form.control,
    name: 'rows' as never,
  });

  const onSubmit = (values: TFormValues) => {
    const { content, interactive } = buildDispatch(values);

    addConversationMessage({
      variables: {
        conversationId,
        content,
        internal: false,
        extraInfo: { whatsappInteractive: interactive },
      },
      onCompleted: () => {
        toast({ title: t('whatsapp-interactive-sent') });
        form.reset(EMPTY[values.type]);
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
              name="type"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-interactive-type')}</Form.Label>
                  <Form.Control>
                    <Select
                      value={field.value}
                      // Resetting to the new type's defaults rather than
                      // keeping the old values: the shapes barely overlap, and
                      // carrying a half-filled list into the CTA form would
                      // leave errors on fields that are no longer shown.
                      onValueChange={(value) =>
                        form.reset(EMPTY[value as TFormValues['type']])
                      }
                    >
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="button">
                          {t('whatsapp-interactive-type-button')}
                        </Select.Item>
                        <Select.Item value="list">
                          {t('whatsapp-interactive-type-list')}
                        </Select.Item>
                        <Select.Item value="cta_url">
                          {t('whatsapp-interactive-type-cta')}
                        </Select.Item>
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.Description>
                    {t(`whatsapp-interactive-type-${type}-hint`)}
                  </Form.Description>
                </Form.Item>
              )}
            />

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

            {type === 'button' && (
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

              {!!arrayError && (
                <p className="text-sm text-destructive">{arrayError}</p>
              )}
            </div>
            )}

            {type === 'list' && (
              <>
                <Form.Field
                  control={form.control}
                  name="opener"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>
                        {t('whatsapp-interactive-opener')}
                      </Form.Label>
                      <Form.Control>
                        <Input
                          {...field}
                          maxLength={MAX_LIST_OPENER}
                          placeholder={t(
                            'whatsapp-interactive-opener-placeholder',
                          )}
                        />
                      </Form.Control>
                      <Form.Description>
                        {t('whatsapp-interactive-opener-description')}
                      </Form.Description>
                      <Form.Message />
                    </Form.Item>
                  )}
                />

                <div className="flex flex-col gap-2">
                  <Form.Label>{t('whatsapp-interactive-rows')}</Form.Label>

                  {rowFields.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2 rounded-md border p-2"
                    >
                      <div className="flex flex-1 flex-col gap-2">
                        <Form.Field
                          control={form.control}
                          name={`rows.${index}.title`}
                          render={({ field }) => (
                            <Form.Item>
                              <Form.Control>
                                <Input
                                  {...field}
                                  maxLength={MAX_ROW_TITLE}
                                  placeholder={t(
                                    'whatsapp-interactive-row-title-placeholder',
                                  )}
                                />
                              </Form.Control>
                              <Form.Message />
                            </Form.Item>
                          )}
                        />
                        <Form.Field
                          control={form.control}
                          name={`rows.${index}.description`}
                          render={({ field }) => (
                            <Form.Item>
                              <Form.Control>
                                <Input
                                  {...field}
                                  maxLength={MAX_ROW_DESCRIPTION}
                                  placeholder={t(
                                    'whatsapp-interactive-row-description-placeholder',
                                  )}
                                />
                              </Form.Control>
                              <Form.Message />
                            </Form.Item>
                          )}
                        />
                      </div>
                      {/* As with buttons, the last row cannot go — a list with
                          nothing in it is not a list. */}
                      {rowFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(index)}
                        >
                          <IconTrash />
                        </Button>
                      )}
                    </div>
                  ))}

                  {rowFields.length < MAX_LIST_ROWS && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => appendRow({ title: '', description: '' })}
                    >
                      <IconPlus />
                      {t('whatsapp-interactive-add-row')}
                    </Button>
                  )}

                  {!!arrayError && (
                    <p className="text-sm text-destructive">{arrayError}</p>
                  )}
                </div>
              </>
            )}

            {type === 'cta_url' && (
              <>
                <Form.Field
                  control={form.control}
                  name="displayText"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>
                        {t('whatsapp-interactive-cta-label')}
                      </Form.Label>
                      <Form.Control>
                        <Input
                          {...field}
                          maxLength={MAX_BUTTON_TITLE}
                          placeholder={t(
                            'whatsapp-interactive-cta-label-placeholder',
                          )}
                        />
                      </Form.Control>
                      <Form.Message />
                    </Form.Item>
                  )}
                />

                <Form.Field
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t('whatsapp-interactive-cta-url')}</Form.Label>
                      <Form.Control>
                        <Input
                          {...field}
                          type="url"
                          inputMode="url"
                          placeholder="https://"
                        />
                      </Form.Control>
                      <Form.Message />
                    </Form.Item>
                  )}
                />
              </>
            )}

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
