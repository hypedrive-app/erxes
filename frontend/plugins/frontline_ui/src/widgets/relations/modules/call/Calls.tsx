import { IconPhoneOff } from '@tabler/icons-react';
import { Separator } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { IRelationWidgetProps } from 'ui-modules';
import { PlivoCallHistoryList } from '@/integrations/plivo/components/PlivoCallHistory';
import { PlivoContactCallButton } from '@/integrations/plivo/components/PlivoContactCallButton';

/**
 * A contact's Plivo call history, on the contact record.
 *
 * Exists because call history was previously reachable only from inside the
 * softphone widget, so an agent opening a contact to ask "what happened with
 * this person?" saw their conversations and tickets but never their calls.
 *
 * Scoped by `customerId` — the contact id stored on the call session — and NOT
 * by matching the contact's phone number. A number can be edited or stored in a
 * different format after the call, and matching on the string would silently
 * detach a contact from calls that are provably theirs.
 *
 * The list, rows, recording player and paging are reused from the softphone's
 * own history; only the scope and the chrome differ.
 */
export const CallRelationWidget = ({
  contentId,
  contentType,
  customerId,
}: IRelationWidgetProps) => {
  const { t } = useTranslation('frontline');

  // The widget receives `customerId` across the federation boundary, except on
  // a customer record where the contact IS the content.
  const resolvedCustomerId =
    contentType === 'core:customer' ? customerId || contentId : customerId;

  // Every other content type reaches its calls through the contact, so without
  // one there is no call log to show — an empty panel is quieter than an error
  // for something that simply does not apply here.
  if (!resolvedCustomerId) {
    return (
      <div className="flex flex-auto flex-col gap-4 justify-center items-center text-muted-foreground">
        <div className="border border-dashed p-6 bg-background rounded-xl">
          <IconPhoneOff />
        </div>
        <span className="text-sm">{t('plivo-no-contact-calls')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="h-11 px-4 flex items-center gap-2 flex-none bg-background justify-between">
        <span className="font-medium text-primary">{t('plivo-calls')}</span>
        <PlivoContactCallButton customerId={resolvedCustomerId} />
      </div>
      <Separator />
      <PlivoCallHistoryList
        customerId={resolvedCustomerId}
        hideSearch
        emptyMessage={t('plivo-no-contact-calls')}
      />
    </>
  );
};
