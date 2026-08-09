import {
  IconBrandDiscord,
  IconBrandWhatsapp,
  IconForms,
  IconMail,
  IconMessageFilled,
  IconPhone,
  IconPhoneCall,
} from '@tabler/icons-react';
import type { FC } from 'react';

import { IntegrationType } from '@/types/Integration';
import {
  InstagramIcon,
  MessengerIcon,
  FacebookIcon,
} from '@/integrations/components/Icons';

/**
 * Icon per integration kind, keyed by the IntegrationType values.
 *
 * Keep this EXHAUSTIVE. ConversationIntegrationBadge falls back to IconMail
 * for an unmapped kind, so a missing entry does not fail loudly — it silently
 * labels the conversation as email. That is how every WhatsApp and Plivo
 * conversation in the inbox came to show an envelope: four of the eleven kinds
 * in IntegrationType had no entry here.
 *
 * The Record is typed by IntegrationType rather than string so adding a kind to
 * the enum without adding an icon is a COMPILE error instead of a silent
 * mislabel.
 */
export const INTEGRATION_ICONS: Record<IntegrationType, FC<any>> = {
  'facebook-messenger': MessengerIcon,
  'facebook-post': FacebookIcon,
  lead: IconForms,
  'instagram-messenger': InstagramIcon,
  'instagram-post': InstagramIcon,
  messenger: IconMessageFilled,
  calls: IconPhone,
  callpro: IconPhone,
  imap: IconMail,
  'discord-messenger': IconBrandDiscord,
  'whatsapp-messenger': IconBrandWhatsapp,
  // Distinguished from `calls` (IconPhone) so the two call integrations are
  // not visually identical in a shared inbox.
  'plivo-call': IconPhoneCall,
  // IMAP genuinely IS email — the only kind for which the envelope is correct.
  imap: IconMail,
  'message-pro': IconMessageFilled,
};
