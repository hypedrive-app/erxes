export enum IntegrationType {
  IMAP = 'imap',
  FACEBOOK_POST = 'facebook-post',
  FACEBOOK_MESSENGER = 'facebook-messenger',
  ERXES_MESSENGER = 'messenger',
  CALL = 'calls',
  MESSAGE_PRO = 'message-pro',
  // Form/lead-capture integrations. Live in the product — cleanIntegrationKind,
  // MessageInput and messageThreadIntegrationKinds all branch on it — but it
  // was missing from this enum, so nothing type-checked against it.
  LEAD = 'lead',
  INSTAGRAM_MESSENGER = 'instagram-messenger',
  INSTAGRAM_POST = 'instagram-post',
  DISCORD_MESSENGER = 'discord-messenger',
  // Served by `getIntegrationsKinds` and carried in INTEGRATION_ICONS, but
  // missing from this enum — the same gap LEAD had, and the reason the icon
  // map failed to type-check against it.
  CALLPRO = 'callpro',
  WHATSAPP_MESSENGER = 'whatsapp-messenger',
  PLIVO_CALL = 'plivo-call',
}
