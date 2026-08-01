import { IconPhone } from '@tabler/icons-react';
import {
  Button,
  Combobox,
  Command,
  Input,
  Separator,
  Spinner,
  formatPhoneNumber,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomersInline, useCustomers } from 'ui-modules';
import { useDebounce } from 'use-debounce';
import { usePlivoCountry } from '@/integrations/plivo/hooks/usePlivoCountry';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import { toDialableNumber } from '@/integrations/plivo/utils/plivoPhone';

/**
 * Address book for the softphone, so an agent can call a known contact without
 * retyping a number they already have.
 *
 * Only contacts with a dialable number are listed. The customer list query
 * selects `primaryPhone` and no other phone field, so there is exactly one
 * number per contact and the row dials it directly — a menu of alternatives
 * would need a wider query than a dialpad tab should trigger.
 */
export const PlivoContacts = () => {
  const { t } = useTranslation('frontline');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const { dial, isReady } = usePlivoDialer();
  const country = usePlivoCountry();

  const { customers, loading, handleFetchMore, totalCount } = useCustomers({
    variables: { searchValue: debouncedSearch },
  });

  const callableCustomers = customers.filter((customer) =>
    toDialableNumber(customer.primaryPhone, country),
  );

  return (
    <Command shouldFilter={false} className="h-full min-h-0">
      <div className="p-3">
        <Command.Input
          asChild
          wrapperClassName="border-b-0"
          className="h-8"
          value={search}
          onValueChange={setSearch}
        >
          <Input
            variant="secondary"
            aria-label={t('plivo-search-contacts')}
            placeholder={t('plivo-search-contacts')}
          />
        </Command.Input>
      </div>
      <Separator />
      {/* Claims whatever the tab body has left rather than naming a height of
          its own, which is what keeps all three tabs the same size. */}
      <Command.List className="min-h-0 flex-auto overflow-auto p-3">
        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!loading && !callableCustomers.length && (
          <Command.Empty className="py-6 text-center text-sm text-accent-foreground">
            {t('plivo-no-callable-contacts')}
          </Command.Empty>
        )}
        {!loading &&
          callableCustomers.map((customer) => {
            const destination = toDialableNumber(customer.primaryPhone, country);

            return (
              <Command.Item
                key={customer._id}
                value={customer._id}
                // The whole row is the call action; a contact is only listed
                // when it has a number worth dialling.
                onSelect={() => dial(destination)}
                disabled={!isReady}
                // Command.Item is `h-8` by default, which fits the single line
                // of text it is normally given. This row stacks a name over a
                // phone number, so the fixed height cut it short and every
                // row's number overlapped the next row's name by ~6px, making
                // each number look like it belonged to the contact below.
                className="h-auto gap-2 py-2"
              >
                <div className="min-w-0 flex-auto">
                  <CustomersInline
                    customers={[customer]}
                    placeholder={t('unnamed-customer')}
                  />
                  <div className="text-xs text-accent-foreground">
                    {formatPhoneNumber({
                      value: customer.primaryPhone ?? '',
                      defaultCountry: country,
                    })}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  // 32px was under the 44px an agent dials with; the icon stays
                  // its old size so only the tappable area grows.
                  className="ml-auto size-11 flex-none [&>svg]:size-4"
                  disabled={!isReady}
                  aria-label={t('plivo-call-contact')}
                  onClick={(event) => {
                    // The row already handles selection; without this the click
                    // would dial twice.
                    event.stopPropagation();
                    dial(destination);
                  }}
                >
                  <IconPhone />
                </Button>
              </Command.Item>
            );
          })}
        {!loading && (
          <Combobox.FetchMore
            fetchMore={handleFetchMore}
            currentLength={customers.length}
            totalCount={totalCount}
          />
        )}
      </Command.List>
    </Command>
  );
};
