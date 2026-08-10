import { IMessageDocument } from '@/inbox/@types/conversationMessages';
import { IContext } from '~/connectionResolvers';

/**
 * The WhatsApp row behind one inbox message, fetched at most once per request.
 *
 * Four fields on this type resolve off the SAME row — delivery state, the
 * quoted message, the wamid and the reactions — and GraphQL calls each resolver
 * separately for every message in the thread. Without this a fifty-message
 * conversation issued two hundred point lookups per open, and paid them on
 * Discord and Facebook threads too, since none of the resolvers can tell what
 * kind of message they were handed before querying.
 *
 * Cached on the request rather than in a module-level map: the value is
 * per-tenant and mutable (delivery status changes several times per message),
 * so a cache outliving the request would serve another subdomain's row or a
 * stale status. `req` is the narrowest thing here with exactly the right
 * lifetime.
 *
 * A DataLoader would additionally batch across MESSAGES, not just across the
 * four fields of one — the repo has that pattern in `sales_api`. It needs the
 * resolver map to be built per request, which this default-export shape does
 * not allow, so this takes the reduction that is available without a
 * restructure: four lookups per message become one.
 */
const loadWhatsappRow = async (
  message: IMessageDocument,
  { models, req }: IContext,
) => {
  const scope = (req || {}) as unknown as Record<string, unknown>;
  const cache = (scope.__whatsappRowCache ??= new Map()) as Map<
    string,
    unknown
  >;

  if (!cache.has(message._id)) {
    cache.set(
      message._id,
      await models.WhatsappConversationMessages.findOne(
        { erxesApiMessageId: message._id },
        {
          mid: 1,
          deliveryStatus: 1,
          errorMessage: 1,
          replyToMid: 1,
          reactions: 1,
        },
      ).lean(),
    );
  }

  return cache.get(message._id) as {
    mid?: string;
    deliveryStatus?: string;
    errorMessage?: string;
    replyToMid?: string;
    reactions?: Array<{ emoji: string; isCustomer: boolean; reactedAt: Date }>;
  } | null;
};

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
  async whatsappDelivery(message: IMessageDocument, _args, context: IContext) {
    const sent = await loadWhatsappRow(message, context);

    if (!sent?.deliveryStatus) return null;

    return {
      status: sent.deliveryStatus,
      // Meta's own reason, surfaced only when it actually failed. This is the
      // difference between "it did not send" and "it did not send BECAUSE the
      // number is not on WhatsApp".
      error: sent.errorMessage || null,
    };
  },

  /**
   * The message this one is a WhatsApp swipe-reply (or quoted send) to, when
   * it is one.
   *
   * Two joins deep: first this message's own WhatsApp row, to read the
   * `replyToMid` it was stored with (Meta's wamid of whatever it quotes);
   * then a SECOND row matched on `mid: replyToMid`, because that is the only
   * thing both directions of a quote agree on — an inbound reply can quote
   * either an inbound or an outbound message, and wamid is the one identifier
   * both share. `_id` is deliberately not part of the first query's filter:
   * this message may be an inbound OR outbound one and either can carry a
   * `replyToMid`, unlike `whatsappDelivery` above which only ever applies to
   * something we sent.
   *
   * Returns null rather than throwing when the quoted message cannot be
   * found locally — Meta's `context.id` can name a message from before this
   * integration existed, or one a redelivery raced away — and a broken quote
   * link is worth losing quietly rather than failing the whole message.
   */
  async whatsappReplyTo(
    message: IMessageDocument,
    _args,
    context: IContext,
  ) {
    const own = await loadWhatsappRow(message, context);

    if (!own?.replyToMid) return null;

    // Not cacheable by the loader above: this is a DIFFERENT row, keyed by the
    // quoted message's wamid rather than by this message's inbox id. It only
    // runs for messages that actually quote something, which is the minority.
    const quoted = await context.models.WhatsappConversationMessages.findOne(
      { mid: own.replyToMid },
      { erxesApiMessageId: 1, content: 1 },
    ).lean();

    if (!quoted?.erxesApiMessageId) return null;

    return {
      _id: quoted.erxesApiMessageId,
      content: quoted.content || null,
    };
  },

  /**
   * This message's OWN wamid, so the composer can quote it as a reply target.
   *
   * The unrelated `mid` field on the schema is dead — nothing writes it onto
   * the inbox row, only onto the WhatsApp module's own row — so this resolves
   * it the same way `whatsappDelivery` does, via `erxesApiMessageId`. Applies
   * to either direction: an agent can reply to a customer's inbound message
   * just as validly as to another agent's outbound one.
   *
   * Null for every non-WhatsApp message, which is also what makes this safe
   * to use as the switch for "can this message be replied to at all" on the
   * frontend — a message with no wamid has nothing Meta would accept as a
   * `context.message_id`.
   */
  async whatsappMid(message: IMessageDocument, _args, context: IContext) {
    const own = await loadWhatsappRow(message, context);

    return own?.mid || null;
  },

  /**
   * Emoji reactions left on this message, by either party.
   *
   * Reactions live on the message they annotate rather than as messages of
   * their own — WhatsApp renders them beneath the bubble, and a row apiece
   * would fill the thread with bubbles for something the customer never sent.
   * So they are resolved here rather than arriving as their own inbox rows.
   *
   * Empty array rather than null when there are none, so the frontend can map
   * over it without a guard; null is reserved for "not a WhatsApp message".
   */
  async whatsappReactions(
    message: IMessageDocument,
    _args,
    context: IContext,
  ) {
    const own = await loadWhatsappRow(message, context);

    if (!own) return null;

    // `senderId` is deliberately not exposed: the thread only needs to know
    // which side left a reaction in order to place the chip, and the reactor's
    // wa_id is a phone number the inbox has no reason to render.
    return (own.reactions || []).map((reaction) => ({
      emoji: reaction.emoji,
      isCustomer: reaction.isCustomer,
      reactedAt: reaction.reactedAt,
    }));
  },
};
