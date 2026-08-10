/**
 * The target object `receiveCustomerMessage` enrolls into automations for the
 * WhatsApp message trigger — the single source of truth for the shape every
 * worker (keyword match, AI context) reads back off the execution. The
 * automation bridge transports targets as untyped records, so producers build
 * this type and consumers cast back to it.
 *
 * Deliberately narrower than the Discord equivalent: there is no `botId`,
 * because inbound WhatsApp messages are not addressed to a bot — Meta delivers
 * every customer message on the business number's webhook regardless of who
 * (or what) answers. `channelId`/`guildId` likewise have no WhatsApp analogue.
 */
export type TWhatsappTriggerTarget = {
  // Meta's message id (`mid`), stable across retries of the same delivery.
  _id: string;
  content: string;
  // Inbox conversation id (`erxesApiId`).
  conversationId?: string;
  // Core customer id (`erxesApiId`).
  customerId?: string;
  // Customer's WhatsApp number in Meta's `wa_id` form (digits, no leading '+').
  from: string;
  // The business number that received it — a WABA can own several, and an
  // automation may legitimately want to answer only on one of them.
  phoneNumberId?: string;
  createdAt?: Date | string;
};

// Config of the WhatsApp message trigger, set in the trigger form: an optional
// comma-separated keyword filter on the message content. Same shape and
// semantics as Discord's so the two forms behave identically.
export type TWhatsappTriggerConfig = {
  keywords?: string;
};
