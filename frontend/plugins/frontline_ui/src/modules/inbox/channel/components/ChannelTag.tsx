import {
  Combobox,
  Command,
  Filter,
  Popover,
  Skeleton,
  TextOverflowTooltip,
  useQueryState,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useGetChannels } from '@/channels/hooks/useGetChannels';
import { IChannel } from '@/inbox/types/Channel';

/**
 * The active channel filter, shown in the inbox filter bar next to
 * {@link IntegrationTypeTag} and behaving the same way: it names the current
 * channel and lets the agent switch to another without reopening the filter
 * menu.
 */
export const ChannelTag = () => {
  const { t } = useTranslation('frontline');
  const [channelId, setChannelId] = useQueryState<string>('channelId');
  const { channels, loading } = useGetChannels();

  if (loading) {
    return <Skeleton className="w-20 h-4" />;
  }

  const selectedChannel = channels?.find(
    (channel: IChannel) => channel._id === channelId,
  );

  if (!selectedChannel) return null;

  return (
    <Filter.BarItem queryKey="channelId">
      <Popover>
        <Popover.Trigger asChild>
          <Filter.BarButton className="rounded-l">
            {selectedChannel.name}
          </Filter.BarButton>
        </Popover.Trigger>
        <Combobox.Content>
          <Command>
            <Command.Input placeholder={t('select-channel')} />
            <Command.List>
              {channels?.map((channel: IChannel) => (
                <Command.Item
                  value={channel._id}
                  key={channel._id}
                  onSelect={() => setChannelId(channel._id)}
                >
                  <TextOverflowTooltip value={channel.name} />
                  <Combobox.Check checked={channel._id === channelId} />
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Combobox.Content>
      </Popover>
    </Filter.BarItem>
  );
};
