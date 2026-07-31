import { IconRefresh } from '@tabler/icons-react';
import {
  Button,
  Combobox,
  Input,
  ScrollArea,
  Separator,
  Spinner,
  Tabs,
} from 'erxes-ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import { PlivoCallHistoryRow } from '@/integrations/plivo/components/PlivoCallHistoryRow';
import { usePlivoCallHistories } from '@/integrations/plivo/hooks/usePlivoCallHistories';
import { PlivoHistoryDirection } from '@/integrations/plivo/types/plivoTypes';

/**
 * Call history for the Plivo number this agent is answering on.
 *
 * Lives inside the softphone widget, mirroring where the Grandstream module
 * puts its own history: the calls an agent wants to review are the calls they
 * just took, and the widget is already open in front of them. The tabs match
 * that module's too, with one addition — voicemails get their own tab, because
 * a voicemail is work waiting to be done and burying it among answered calls is
 * how it gets missed.
 */
export const PlivoCallHistory = () => {
  const { t } = useTranslation('frontline');
  const [totalCalls, setTotalCalls] = useState(0);

  return (
    // Fills the height the tab body already fixes, rather than setting a second
    // one of its own: the previous `h-[26rem]` was taller than the space it was
    // given, so the final row was drawn underneath the tab strip.
    <Tabs defaultValue="all" className="flex h-full min-h-0 flex-col">
      <Tabs.List className="grid grid-cols-4 gap-1 px-3 pt-3">
        <Tabs.Trigger value="all">
          {t('all-count', { count: totalCalls })}
        </Tabs.Trigger>
        <Tabs.Trigger value="incoming">{t('incoming')}</Tabs.Trigger>
        <Tabs.Trigger value="outgoing">{t('outgoing')}</Tabs.Trigger>
        <Tabs.Trigger value="voicemail">{t('plivo-voicemails')}</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="all" className="flex-auto overflow-hidden">
        <PlivoCallHistoryList onTotalCountChange={setTotalCalls} />
      </Tabs.Content>
      <Tabs.Content value="incoming" className="flex-auto overflow-hidden">
        <PlivoCallHistoryList direction="inbound" />
      </Tabs.Content>
      <Tabs.Content value="outgoing" className="flex-auto overflow-hidden">
        <PlivoCallHistoryList direction="outbound" />
      </Tabs.Content>
      <Tabs.Content value="voicemail" className="flex-auto overflow-hidden">
        <PlivoCallHistoryList isVoicemail />
      </Tabs.Content>
    </Tabs>
  );
};

export const PlivoCallHistoryList = ({
  direction,
  isVoicemail,
  onTotalCountChange,
}: {
  direction?: PlivoHistoryDirection;
  isVoicemail?: boolean;
  onTotalCountChange?: (totalCount: number) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);

  const {
    callHistories,
    totalCount,
    loading,
    error,
    refetch,
    handleFetchMore,
  } = usePlivoCallHistories({
    direction,
    isVoicemail,
    searchValue: debouncedSearch,
  });

  // The tab strip lives above this component but the count belongs to the
  // query, so it is reported upward rather than fetched a second time.
  useEffect(() => {
    onTotalCountChange?.(totalCount);
  }, [totalCount, onTotalCountChange]);

  // `loading` stays true on every `cache-and-network` refetch, so the spinner
  // is shown only while there is genuinely nothing to look at — otherwise the
  // list would blink away under the agent on each background refresh.
  const isInitialLoading = loading && !callHistories;

  const renderBody = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm text-destructive">
            {t('plivo-call-history-error')}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <IconRefresh />
            {t('try-again')}
          </Button>
        </div>
      );
    }

    if (isInitialLoading) {
      return (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      );
    }

    if (!callHistories?.length) {
      return (
        <p className="py-6 text-center text-sm text-accent-foreground">
          {isVoicemail ? t('plivo-no-voicemails') : t('no-calls')}
        </p>
      );
    }

    return (
      <>
        <div className="flex flex-col gap-1">
          {callHistories.map((callHistory) => (
            <PlivoCallHistoryRow
              key={callHistory._id}
              callHistory={callHistory}
            />
          ))}
        </div>
        <Combobox.FetchMore
          fetchMore={handleFetchMore}
          currentLength={callHistories.length}
          totalCount={totalCount}
        />
      </>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search-by-phone-number')}
          aria-label={t('search-by-phone-number')}
          // Matches the contacts search box, so the two list tabs line up.
          className="h-8"
        />
      </div>
      <Separator />
      <ScrollArea className="flex-auto" viewportClassName="p-3">
        {renderBody()}
      </ScrollArea>
    </div>
  );
};
