import { IntegrationType } from '@/types/Integration';

/**
 * Display metadata per integration kind.
 *
 * Typed by IntegrationType rather than left as an inferred object literal, so a
 * kind added to the enum without an entry here is a COMPILE error. It was
 * previously inferred, and two kinds — message-pro and lead — had no entry:
 * IntegrationDetailPage reads this with optional chaining, so those rendered
 * with a blank name and no icon rather than failing visibly.
 */
export const INTEGRATIONS: Record<
  IntegrationType,
  { name: string; descriptionKey: string; img: string }
> = {
  [IntegrationType.ERXES_MESSENGER]: {
    name: 'erxes Messenger',
    descriptionKey: 'integration-desc-erxes-messenger',
    img: 'messenger.webp',
  },
  [IntegrationType.FACEBOOK_MESSENGER]: {
    name: 'Facebook Messenger',
    descriptionKey: 'integration-desc-facebook-messenger',
    img: 'fb-messenger.svg',
  },
  [IntegrationType.FACEBOOK_POST]: {
    name: 'Facebook Post',
    descriptionKey: 'integration-desc-facebook-post',
    img: 'fb.svg',
  },
  [IntegrationType.INSTAGRAM_MESSENGER]: {
    name: 'Instagram Messenger',
    descriptionKey: 'integration-desc-instagram-messenger',
    img: 'ig.svg',
  },
  [IntegrationType.INSTAGRAM_POST]: {
    name: 'Instagram Post',
    descriptionKey: 'integration-desc-instagram-post',
    img: 'ig.svg',
  },
  [IntegrationType.DISCORD_MESSENGER]: {
    name: 'Discord',
    descriptionKey: 'integration-desc-discord',
    img: 'discord.svg',
  },
  [IntegrationType.WHATSAPP_MESSENGER]: {
    name: 'WhatsApp',
    descriptionKey: 'integration-desc-whatsapp',
    img: 'whatsapp.svg',
  },
  [IntegrationType.PLIVO_CALL]: {
    name: 'Plivo',
    descriptionKey: 'integration-desc-plivo',
    img: 'plivo.svg',
  },
  [IntegrationType.CALL]: {
    name: 'Call',
    descriptionKey: 'integration-desc-call',
    img: 'grandstream.webp',
  },
  [IntegrationType.CALLPRO]: {
    name: 'Callpro',
    descriptionKey: 'integration-desc-callpro',
    img: 'callpro.webp',
  },
  [IntegrationType.IMAP]: {
    name: 'IMAP',
    descriptionKey: 'integration-desc-imap',
    img: 'email.webp',
  },
  [IntegrationType.MESSAGE_PRO]: {
    name: 'Message Pro',
    descriptionKey: 'integration-desc-message-pro',
    // No dedicated asset ships for this one; the generic messenger mark is the
    // closest existing image rather than a broken src.
    img: 'messenger.webp',
  },
  [IntegrationType.LEAD]: {
    name: 'Forms',
    descriptionKey: 'integration-desc-lead',
    img: 'webhook.webp',
  },
};
