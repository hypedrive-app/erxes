import { IconUserOff } from '@tabler/icons-react';
import { IRelationWidgetProps } from 'ui-modules';

import { EnrichmentPanel } from '@/enrichment/components/EnrichmentPanel';

export const Widgets = (props: IRelationWidgetProps) => {
  const { contentId, contentType, customerId } = props;

  // On a contact page the host sends the same id twice; elsewhere (a deal, a
  // conversation) contentId is that record and customerId is the person behind
  // it. Reading customerId first is what makes the panel work on both.
  const resolvedCustomerId =
    contentType === 'core:customer' ? customerId || contentId : customerId;

  // The relation-widget tab list is global, so this panel also opens on records
  // that have no contact at all. Saying that plainly beats returning null,
  // which is indistinguishable from a panel that is still loading.
  if (!resolvedCustomerId) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center px-6 text-center">
          <IconUserOff size={48} className="text-muted-foreground" />
          <h3 className="mt-6 text-lg font-semibold">No contact here</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enrichment looks up a person. Open this panel from a contact, or
            from a deal or conversation that has one.
          </p>
        </div>
      </div>
    );
  }

  return <EnrichmentPanel customerId={resolvedCustomerId} />;
};

export default Widgets;
