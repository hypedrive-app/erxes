import { IRelationWidgetProps } from 'ui-modules';
import { CallRelationWidget } from './relations/modules/call/Calls';
import { ConversationRelationWidget } from './relations/modules/conversation/Conversation';
import { TicketRelationWidget } from './relations/modules/ticket/Tickets';

const RelationWidget = (props: IRelationWidgetProps) => {
  const { module } = props;
  switch (module) {
    case 'ticket':
      return <TicketRelationWidget {...props} />;
    case 'conversation':
      return <ConversationRelationWidget {...props} />;
    case 'call':
      return <CallRelationWidget {...props} />;
    default:
      return null;
  }
};

export default RelationWidget;
