import { IntegrationType } from '@/types/Integration';

/**
 * What removing an integration actually destroys, per kind.
 *
 * Removal is not an unlink: each kind's backend remove handler deletes the
 * plugin-local records the integration owns, and that deletion is permanent and
 * not undone if a later step fails. The confirmation has to say so, so the
 * translation key here names the collections that kind really deletes.
 *
 * `undefined` means the kind deletes nothing beyond the integration row itself,
 * so its confirmation stays the plain one — a destructive-sounding warning on a
 * non-destructive action trains operators to ignore the warning that matters.
 */
const REMOVAL_EFFECT_KEYS: Partial<Record<IntegrationType, string>> = {
  // whatsapp/helpers.ts removes conversations, their messages and customers.
  [IntegrationType.WHATSAPP_MESSENGER]: 'remove-integration-effect-whatsapp',
  // facebook/helpers.ts removes post conversations, conversations, messages
  // and customers, for both the messenger and post kinds.
  [IntegrationType.FACEBOOK_MESSENGER]: 'remove-integration-effect-facebook',
  [IntegrationType.FACEBOOK_POST]: 'remove-integration-effect-facebook',
  // instagram/helpers.ts additionally removes comment conversations.
  [IntegrationType.INSTAGRAM_MESSENGER]: 'remove-integration-effect-instagram',
  [IntegrationType.INSTAGRAM_POST]: 'remove-integration-effect-instagram',
  // discord/messageBroker.ts removes conversations, messages, customers and
  // the bot registration.
  [IntegrationType.DISCORD_MESSENGER]: 'remove-integration-effect-discord',
  // imap/messageBroker.ts removes stored messages and customers.
  [IntegrationType.IMAP]: 'remove-integration-effect-imap',
  // plivo/helpers.ts removes call sessions and customers.
  [IntegrationType.PLIVO_CALL]: 'remove-integration-effect-plivo',
  // call/helpers.ts removes customers only; call history is left in place.
  [IntegrationType.CALL]: 'remove-integration-effect-call',
  // erxes-messenger is excluded from the plugin dispatch entirely
  // (integrations.ts:603), so only the integration row goes.
  [IntegrationType.ERXES_MESSENGER]: undefined,
  [IntegrationType.MESSAGE_PRO]: undefined,
};

/**
 * The translation key describing what a given kind's removal destroys, or
 * `null` when removal only drops the integration itself.
 */
export const getIntegrationRemovalEffectKey = (
  integrationType?: string,
): string | null =>
  REMOVAL_EFFECT_KEYS[integrationType as IntegrationType] ?? null;
