import { stripHtml } from 'string-strip-html';
import { IModels } from '~/connectionResolvers';
import {
  sendWhatsappContacts,
  sendWhatsappInteractive,
  sendWhatsappLocation,
  sendWhatsappMedia,
  sendWhatsappTemplate,
  sendWhatsappText,
  WhatsappApiError,
} from '@/integrations/whatsapp/utils';
import { uploadAttachmentToWhatsapp } from '@/integrations/whatsapp/media';
import {
  CUSTOMER_SERVICE_WINDOW_MS,
  whatsappMediaTypeFor,
} from '@/integrations/whatsapp/constants';
import { debugError } from '@/integrations/whatsapp/debuggers';
import {
  IWhatsappContactCard,
  IWhatsappInteractiveDispatch,
  IWhatsappLocationDispatch,
  IWhatsappTemplateDispatch,
  IWhatsappTemplateSendComponent,
} from '@/integrations/whatsapp/@types';

const OUTSIDE_WINDOW_MESSAGE =
  'This conversation is outside the 24 hour WhatsApp reply window. ' +
  'Only a pre-approved template message can be sent.';

/**
 * Reads the template the inbox dispatched, if any.
 *
 * The inbox forwards `extraInfo` verbatim from `conversationMessageAdd`, so a
 * template ride-alongs on `extraInfo.whatsappTemplate` rather than needing a
 * parallel send mutation. Anything malformed is treated as "no template" so a
 * bad payload falls back to the free-form path (and its 24 hour guard) instead
 * of being sent as an unvalidated template.
 */
const getTemplateDispatch = (
  extraInfo: unknown,
): IWhatsappTemplateDispatch | undefined => {
  if (!extraInfo || typeof extraInfo !== 'object') {
    return undefined;
  }

  const { whatsappTemplate } = extraInfo as {
    whatsappTemplate?: Partial<IWhatsappTemplateDispatch>;
  };

  if (
    !whatsappTemplate ||
    typeof whatsappTemplate.name !== 'string' ||
    typeof whatsappTemplate.languageCode !== 'string' ||
    !whatsappTemplate.name ||
    !whatsappTemplate.languageCode
  ) {
    return undefined;
  }

  return {
    name: whatsappTemplate.name,
    languageCode: whatsappTemplate.languageCode,
    components: Array.isArray(whatsappTemplate.components)
      ? (whatsappTemplate.components as IWhatsappTemplateSendComponent[])
      : undefined,
  };
};

/**
 * Reads an interactive message off `extraInfo`, the same envelope templates
 * ride on.
 *
 * Validated to the shape Meta accepts rather than passed through: a malformed
 * interactive is rejected at send time with an error that does not name the
 * offending field, which is expensive to debug from a webhook log. Rejecting
 * here names it.
 */
const getInteractiveDispatch = (
  extraInfo: unknown,
): IWhatsappInteractiveDispatch | undefined => {
  if (!extraInfo || typeof extraInfo !== 'object') {
    return undefined;
  }

  const { whatsappInteractive } = extraInfo as {
    whatsappInteractive?: Partial<IWhatsappInteractiveDispatch>;
  };

  if (!whatsappInteractive) {
    return undefined;
  }

  const { type } = whatsappInteractive;

  if (type !== 'button' && type !== 'list' && type !== 'cta_url') {
    throw new Error(
      'WhatsApp interactive message needs a type of button, list or cta_url',
    );
  }

  const body = (whatsappInteractive as { body?: { text?: string } }).body;

  if (!body?.text?.trim()) {
    throw new Error('WhatsApp interactive message needs body text');
  }

  if (body.text.length > 1024) {
    throw new Error('WhatsApp interactive body must be 1024 characters or fewer');
  }

  const footer = (whatsappInteractive as { footer?: { text?: string } }).footer;

  if (footer?.text && footer.text.length > 60) {
    throw new Error('WhatsApp interactive footer must be 60 characters or fewer');
  }

  // Meta's own caps. Checked here because exceeding one costs a round trip and
  // loses whatever the agent composed.
  //
  // The lengths are re-checked rather than trusted to the composer: `extraInfo`
  // is an open field on `conversationMessageAdd`, so an API client or a future
  // composer reaches this without passing through the builder's own Zod schema,
  // and Meta's answer to an over-long title names no field.
  if (type === 'button') {
    const buttons =
      (whatsappInteractive as {
        action?: { buttons?: Array<{ reply?: { title?: string } }> };
      }).action?.buttons || [];

    if (!buttons.length || buttons.length > 3) {
      throw new Error('WhatsApp reply buttons must number between 1 and 3');
    }

    for (const [index, button] of buttons.entries()) {
      const title = button?.reply?.title || '';

      if (!title.trim()) {
        throw new Error(`WhatsApp reply button ${index + 1} needs text`);
      }

      if (title.length > 20) {
        throw new Error(
          `WhatsApp reply button ${index + 1} must be 20 characters or fewer`,
        );
      }
    }
  }

  if (type === 'list') {
    const action = (whatsappInteractive as {
      action?: {
        button?: string;
        sections?: Array<{
          rows?: Array<{ title?: string; description?: string }>;
        }>;
      };
    }).action;

    const opener = action?.button || '';

    if (!opener.trim()) {
      throw new Error('A WhatsApp list needs a label on the button that opens it');
    }

    if (opener.length > 20) {
      throw new Error('A WhatsApp list button must be 20 characters or fewer');
    }

    const sections = action?.sections || [];
    const rows = sections.flatMap((section) => section.rows || []);

    // 10 rows in TOTAL across every section, not 10 per section.
    if (!rows.length || rows.length > 10) {
      throw new Error('A WhatsApp list must have between 1 and 10 rows in total');
    }

    for (const [index, row] of rows.entries()) {
      if (!row?.title?.trim()) {
        throw new Error(`WhatsApp list row ${index + 1} needs a title`);
      }

      if (row.title.length > 24) {
        throw new Error(
          `WhatsApp list row ${index + 1} title must be 24 characters or fewer`,
        );
      }

      if (row.description && row.description.length > 72) {
        throw new Error(
          `WhatsApp list row ${index + 1} description must be 72 characters or fewer`,
        );
      }
    }
  }

  return whatsappInteractive as IWhatsappInteractiveDispatch;
};


/**
 * Reads a location off `extraInfo`, the same envelope templates ride on.
 *
 * Coordinates are validated to Meta's ranges rather than forwarded: latitude
 * and longitude arriving as strings from a form is the common case, and `0,0`
 * from an unparsed field is a real place in the Atlantic that Meta will
 * happily deliver.
 */
const getLocationDispatch = (
  extraInfo: unknown,
): IWhatsappLocationDispatch | undefined => {
  if (!extraInfo || typeof extraInfo !== 'object') {
    return undefined;
  }

  const { whatsappLocation } = extraInfo as {
    whatsappLocation?: Partial<IWhatsappLocationDispatch>;
  };

  if (!whatsappLocation) {
    return undefined;
  }

  const latitude = Number(whatsappLocation.latitude);
  const longitude = Number(whatsappLocation.longitude);

  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    throw new Error('A WhatsApp location needs a latitude between -90 and 90');
  }

  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new Error(
      'A WhatsApp location needs a longitude between -180 and 180',
    );
  }

  return {
    latitude,
    longitude,
    name: whatsappLocation.name,
    address: whatsappLocation.address,
  };
};

/**
 * Reads contact cards off `extraInfo`.
 *
 * `formatted_name` is the one field Meta requires on every card, and a card
 * without it is rejected for the whole message — so an unnamed card is refused
 * here, where the offending entry can be named.
 */
const getContactsDispatch = (
  extraInfo: unknown,
): IWhatsappContactCard[] | undefined => {
  if (!extraInfo || typeof extraInfo !== 'object') {
    return undefined;
  }

  const { whatsappContacts } = extraInfo as {
    whatsappContacts?: unknown;
  };

  if (!whatsappContacts) {
    return undefined;
  }

  if (!Array.isArray(whatsappContacts) || !whatsappContacts.length) {
    throw new Error('A WhatsApp contact message needs at least one card');
  }

  for (const [index, card] of whatsappContacts.entries()) {
    if (!card?.name?.formatted_name?.trim()) {
      throw new Error(`Contact card ${index + 1} needs a name`);
    }
  }

  return whatsappContacts as IWhatsappContactCard[];
};

/**
 * Handles an agent's outgoing reply, dispatched from the inbox.
 *
 * Two send paths:
 *
 * - **Template** — when `extraInfo.whatsappTemplate` carries
 *   `{ name, languageCode, components? }`. This is the ONLY thing Meta accepts
 *   more than 24 hours after the customer's last message, so it deliberately
 *   skips the window guard; blocking it would defeat its entire purpose.
 * - **Free-form text** — everything else, still gated on the 24 hour window.
 *
 * For free-form, WhatsApp only accepts a message within 24 hours of the
 * customer's last message; after that Meta rejects it (131047). The window is
 * checked locally first so the common case fails fast with a message an agent
 * can act on, but Meta remains the authority — its own rejection is translated
 * to the same wording, since our `lastCustomerMessageAt` can lag behind if a
 * webhook was missed.
 *
 * Internal notes never reach here: `conversationMessageAdd` stores them and
 * returns before it dispatches to any integration.
 */
// `subdomain` is threaded in because sending an attachment has to read it back
// out of this tenant's own file storage, and storage config is per-subdomain.
export const handleWhatsappMessage = async (
  models: IModels,
  subdomain: string,
  msg,
) => {
  const { payload } = msg;
  const doc = JSON.parse(payload || '{}');

  const conversation = await models.WhatsappConversations.getConversation({
    erxesApiId: doc.conversationId,
  });

  const integration = await models.WhatsappIntegrations.getIntegration({
    erxesApiId: conversation.integrationId,
  });

  const template = getTemplateDispatch(doc.extraInfo);
  const interactive = getInteractiveDispatch(doc.extraInfo);
  const location = getLocationDispatch(doc.extraInfo);
  const contacts = getContactsDispatch(doc.extraInfo);
  // The wamid the agent chose to quote. Not carried on `extraInfo` like the
  // template above — `conversationMessageAdd` already forwards this generic,
  // provider-agnostic field to every integration's payload (Discord reads the
  // same field for its own reply-to, off its own foreign message id).
  const replyToMid =
    typeof doc.replyToMessageId === 'string' && doc.replyToMessageId
      ? doc.replyToMessageId
      : undefined;

  // The resolved template text is passed as `content` by the composer so the
  // thread shows what the customer actually received rather than a blank
  // bubble; a template with no body parameters still renders its approved copy.
  const content = stripHtml(doc.content || '').result.trim();

  if (!template && !interactive && !location && !contacts && !content) {
    throw new Error('Cannot send an empty WhatsApp message');
  }

  const lastCustomerMessageAt = conversation.lastCustomerMessageAt;

  if (
    !template &&
    lastCustomerMessageAt &&
    Date.now() - new Date(lastCustomerMessageAt).getTime() >
      CUSTOMER_SERVICE_WINDOW_MS
  ) {
    throw new Error(OUTSIDE_WINDOW_MESSAGE);
  }

  const attachments = doc.attachments || [];

  /**
   * Meta sends ONE kind of thing per message, and the branch below picks the
   * first that is present — so a caller supplying two used to have the loser
   * dropped with no error, and the local row recorded only the winner.
   *
   * No first-party composer does this, but nothing at the API boundary stopped
   * it either: `extraInfo` and `attachments` are independent fields on
   * `conversationMessageAdd`, so the next composer to send a template WITH a
   * file would have lost the file silently. Named here rather than left to be
   * discovered from a customer not receiving something.
   */
  const kinds = [
    template && 'a template',
    interactive && 'an interactive message',
    location && 'a location',
    contacts && 'a contact card',
    attachments.length ? 'an attachment' : '',
  ].filter(Boolean);

  if (kinds.length > 1) {
    throw new Error(
      `A WhatsApp message carries one kind of content, but this one has ${kinds.join(
        ' and ',
      )}. Send them as separate messages.`,
    );
  }


  let mid: string;

  try {
    if (template) {
      mid = await sendWhatsappTemplate({
        accessToken: integration.accessToken,
        phoneNumberId: integration.phoneNumberId,
        // Meta expects the recipient without a leading `+`.
        to: conversation.senderId,
        name: template.name,
        languageCode: template.languageCode,
        components: template.components,
        replyToMid,
      });
    } else if (interactive) {
      mid = await sendWhatsappInteractive({
        accessToken: integration.accessToken,
        phoneNumberId: integration.phoneNumberId,
        to: conversation.senderId,
        interactive,
        replyToMid,
      });
    } else if (location) {
      mid = await sendWhatsappLocation({
        accessToken: integration.accessToken,
        phoneNumberId: integration.phoneNumberId,
        to: conversation.senderId,
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name,
        address: location.address,
        replyToMid,
      });
    } else if (contacts) {
      mid = await sendWhatsappContacts({
        accessToken: integration.accessToken,
        phoneNumberId: integration.phoneNumberId,
        to: conversation.senderId,
        contacts,
        replyToMid,
      });
    } else if (attachments.length) {
      /**
       * Attachments used to be written to our database and never sent — the
       * agent saw the file in the inbox while the recipient got text only.
       *
       * Meta sends one media file per message, so each attachment becomes its
       * own message. The first carries the agent's text as its caption, which
       * is how WhatsApp itself pairs a note with a file; any remaining files
       * follow uncaptioned. The mid recorded against the row is the FIRST
       * one — that is the message the caption belongs to, and the row's
       * content is that same text.
       */
      const mids: string[] = [];

      for (const [index, attachment] of attachments.entries()) {
        const mediaId = await uploadAttachmentToWhatsapp({
          subdomain,
          accessToken: integration.accessToken,
          phoneNumberId: integration.phoneNumberId,
          attachment,
        });

        mids.push(
          await sendWhatsappMedia({
            accessToken: integration.accessToken,
            phoneNumberId: integration.phoneNumberId,
            to: conversation.senderId,
            mediaId,
            mediaType: whatsappMediaTypeFor(attachment.type),
            caption: index === 0 ? content || undefined : undefined,
            fileName: attachment.name,
            // Same reasoning as the caption: only the first message is "the"
            // reply an agent composed, so only it carries the quote.
            replyToMid: index === 0 ? replyToMid : undefined,
          }),
        );
      }

      mid = mids[0];
    } else {
      mid = await sendWhatsappText({
        accessToken: integration.accessToken,
        phoneNumberId: integration.phoneNumberId,
        to: conversation.senderId,
        text: content,
        replyToMid,
      });
    }
  } catch (e) {
    if (e instanceof WhatsappApiError && e.isOutsideServiceWindow) {
      throw new Error(OUTSIDE_WINDOW_MESSAGE);
    }

    // A dead token is otherwise invisible until someone happens to open
    // settings and click repair — `isAuthError`/`isRetryable` were computed on
    // every failure but nothing ever read them, so the integration could sit
    // broken through any number of failed sends while `healthStatus` still
    // said 'healthy'. Rate limits and other transient codes are deliberately
    // left alone: they are not evidence the integration is broken, and
    // flapping the status on every throttle would make the settings screen
    // noise rather than signal.
    if (e instanceof WhatsappApiError && e.isAuthError) {
      await models.WhatsappIntegrations.updateOne(
        { erxesApiId: integration.erxesApiId },
        { $set: { healthStatus: 'error', error: e.message } },
      ).catch(() => undefined);
    }

    debugError(`Failed to send WhatsApp message: ${e.message}`);
    throw e;
  }

  const sent = await models.WhatsappConversationMessages.addMessage({
    mid,
    conversationId: conversation._id,
    content,
    attachments: doc.attachments,
    userId: doc.userId,
    createdAt: new Date(),
    replyToMid,
  });

  /**
   * `whatsappMessageId` is returned so the inbox can bind this row to the
   * message it is about to create.
   *
   * The two are only linkable in that direction: the integration sends BEFORE
   * the inbox message exists, so this row cannot know the inbox id yet, and
   * without the bind nothing joins Meta's delivery status back to the message
   * an agent is looking at. `erxesApiMessageId` was already being set on the
   * inbound path for exactly this purpose; outbound never set it.
   */
  return { ...sent.toObject(), whatsappMessageId: sent._id };
};
