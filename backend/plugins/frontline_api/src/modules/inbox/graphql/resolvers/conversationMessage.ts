import { IMessageDocument } from '@/inbox/@types/conversationMessages';
import { IContext } from '~/connectionResolvers';

export default {
  user(message: IMessageDocument) {
    return message.userId && { __typename: 'User', _id: message.userId };
  },

  customer(message: IMessageDocument) {
    return (
      message.customerId && { __typename: 'Customer', _id: message.customerId }
    );
  },

  /**
   * Delivery state for messages sent through WhatsApp.
   *
   * Meta reports sent/delivered/read/failed on a `statuses` webhook, and the
   * WhatsApp module already records it against the message — but nothing ever
   * read it back, so a message Meta REFUSED looked exactly like a delivered
   * one in the inbox. An agent had no way to know a reply never arrived.
   *
   * Joined on erxesApiMessageId, the WhatsApp row's own pointer back to this
   * message. NOT on `mid`: ConversationMessage exposes a mid field in the
   * schema, but nothing ever writes it — it is dead, and a resolver built on
   * it would silently return null for every message.
   *
   * Resolved rather than copied onto the inbox row because the value changes
   * several times per message (sent -> delivered -> read); a stored copy would
   * be a second thing to keep in sync.
   *
   * Null for every other channel — they do not report delivery this way, and
   * inventing a status for them would be worse than saying nothing.
   */
  async whatsappDelivery(message: IMessageDocument, _args, { models }: IContext) {
    const sent = await models.WhatsappConversationMessages.findOne(
      { erxesApiMessageId: message._id },
      { deliveryStatus: 1, errorMessage: 1 },
    ).lean();

    if (!sent?.deliveryStatus) return null;

    return {
      status: sent.deliveryStatus,
      // Meta's own reason, surfaced only when it actually failed. This is the
      // difference between "it did not send" and "it did not send BECAUSE the
      // number is not on WhatsApp".
      error: sent.errorMessage || null,
    };
  },
};
