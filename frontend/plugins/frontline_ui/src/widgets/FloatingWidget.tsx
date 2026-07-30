import { CallWidget } from '@/integrations/call/components/CallWidget';
import { SipContainer } from '@/integrations/call/components/SipContainer';
import { PlivoContainer } from '@/integrations/plivo/components/PlivoContainer';
import { PlivoWidget } from '@/integrations/plivo/components/PlivoWidget';

/**
 * Both softphones mount side by side and each gates itself: the Grandstream
 * container renders nothing without a call config, and the Plivo one renders
 * nothing until an agent has picked a Plivo number. An account using only one
 * provider therefore only ever sees that one.
 */
const FloatingWidget = () => {
  return (
    <>
      <SipContainer>
        <CallWidget />
      </SipContainer>
      <PlivoContainer>
        <PlivoWidget />
      </PlivoContainer>
    </>
  );
};

export default FloatingWidget;
