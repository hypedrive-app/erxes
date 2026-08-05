import { useConversationContext } from '@/inbox/conversations/conversation-detail/hooks/useConversationContext';
import { Suspense, lazy } from 'react';
import { IntegrationType } from '@/types/Integration';

const FacebookPostTrigger = lazy(() =>
  import('@/integrations/facebook/components/FacebookPostTrigger').then(
    (module) => ({ default: module.FacebookPostTrigger }),
  ),
);

const IgPostTrigger = lazy(() =>
  import('@/integrations/instagram/components/IgPostTrigger').then(
    (module) => ({ default: module.IgPostTrigger }),
  ),
);

/**
 * Calling is offered on every channel, not just voice ones: an agent handling a
 * chat or an email often needs to phone the customer back. The button hides
 * itself when there is no dialable number or no softphone, so it is never dead.
 */
const PlivoConversationCallButton = lazy(() =>
  import('@/integrations/plivo/components/PlivoConversationCallButton').then(
    (module) => ({ default: module.PlivoConversationCallButton }),
  ),
);

/**
 * Same reasoning as PlivoConversationCallButton above: offered on every
 * channel's thread, not gated on the open conversation itself being
 * WhatsApp — see that component's own file for why.
 */
const WhatsappConversationButton = lazy(() =>
  import('@/integrations/whatsapp/components/WhatsappConversationButton').then(
    (module) => ({ default: module.WhatsappConversationButton }),
  ),
);

export const IntegrationActions = () => {
  const { integration, _id } = useConversationContext();

  return (
    <Suspense fallback={<div />}>
      <PlivoConversationCallButton />
      <WhatsappConversationButton />
      {integration?.kind === IntegrationType.FACEBOOK_POST && (
        <FacebookPostTrigger erxesApiId={_id} />
      )}
      {integration?.kind === IntegrationType.INSTAGRAM_POST && (
        <IgPostTrigger erxesApiId={_id} />
      )}
    </Suspense>
  );
};
