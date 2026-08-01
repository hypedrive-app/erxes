import { useConversationContext } from '@/inbox/conversations/hooks/useConversationContext';
import { FacebookMessageInputWrapper } from '@/integrations/facebook/components/FacebookMessageInputWrapper';
import { PlivoMessageInputWrapper } from '@/integrations/plivo/components/PlivoMessageInputWrapper';
import { WhatsappMessageInputWrapper } from '@/integrations/whatsapp/components/WhatsappMessageInputWrapper';
import { IntegrationType } from '@/types/Integration';
export const MessageInputIntegrationWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { integration } = useConversationContext();

  if (integration?.kind === IntegrationType.FACEBOOK_MESSENGER) {
    return (
      <FacebookMessageInputWrapper>{children}</FacebookMessageInputWrapper>
    );
  }

  if (integration?.kind === IntegrationType.WHATSAPP_MESSENGER) {
    return (
      <WhatsappMessageInputWrapper>{children}</WhatsappMessageInputWrapper>
    );
  }

  if (integration?.kind === IntegrationType.PLIVO_CALL) {
    return <PlivoMessageInputWrapper>{children}</PlivoMessageInputWrapper>;
  }

  return children;
};
