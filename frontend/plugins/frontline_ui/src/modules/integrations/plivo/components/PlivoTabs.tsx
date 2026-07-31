import {
  IconAddressBook,
  IconDialpadFilled,
  IconHistory,
} from '@tabler/icons-react';
import { Button, Tabs } from 'erxes-ui';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { PlivoCallHistory } from '@/integrations/plivo/components/PlivoCallHistory';
import { PlivoContacts } from '@/integrations/plivo/components/PlivoContacts';
import { plivoUiAtom } from '@/integrations/plivo/states/plivoStates';

/**
 * History / dialpad / address book switch for the softphone panel, following
 * the Grandstream widget's tab layout so the two providers behave the same way.
 *
 * The dialpad is passed in rather than imported so the panel can keep rendering
 * the tab strip during a call, when the keypad slot holds the in-call surface.
 */
export const PlivoTabs = ({ keypad }: { keypad: React.ReactNode }) => {
  const { t } = useTranslation('frontline');
  const [plivoUi, setPlivoUi] = useAtom(plivoUiAtom);

  return (
    <Tabs value={plivoUi} onValueChange={setPlivoUi}>
      {/* Mounted only while selected: the history query is scoped to the
          agent's number and there is no reason to run it, or to hold its
          audio players, behind the dialpad. */}
      {plivoUi === 'history' && (
        <Tabs.Content value="history">
          <PlivoCallHistory />
        </Tabs.Content>
      )}
      <Tabs.Content value="keypad">{keypad}</Tabs.Content>
      <Tabs.Content value="address-book">
        <PlivoContacts />
      </Tabs.Content>
      <Tabs.List className="grid grid-cols-3 p-1 border-t border-b-0">
        <PlivoTabsTrigger value="history">
          <IconHistory />
          {t('call-history')}
        </PlivoTabsTrigger>
        <PlivoTabsTrigger value="keypad">
          <IconDialpadFilled />
          {t('call')}
        </PlivoTabsTrigger>
        <PlivoTabsTrigger value="address-book">
          <IconAddressBook />
          {t('contact')}
        </PlivoTabsTrigger>
      </Tabs.List>
    </Tabs>
  );
};

const PlivoTabsTrigger = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: string;
}) => {
  return (
    <Button
      // The active tab is marked by weight and a background as well as by
      // colour, so it stays legible without relying on hue alone.
      className="flex-col h-14 gap-1 px-1 text-xs [&>svg]:size-5 after:hidden data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:hover:bg-accent-foreground/10"
      variant="ghost"
      asChild
    >
      <Tabs.Trigger value={value}>{children}</Tabs.Trigger>
    </Button>
  );
};
