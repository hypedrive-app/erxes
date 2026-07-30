import { IconBackspace } from '@tabler/icons-react';
import { Button, Input, cn, formatPhoneNumber } from 'erxes-ui';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { usePlivo } from '@/integrations/plivo/components/PlivoProvider';
import {
  plivoNumberAtom,
  plivoStateAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallStatusEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

/** True when the client is logged in and no call is already up. */
export const useCanPlaceCall = () => {
  const plivoState = useAtomValue(plivoStateAtom);

  return (
    plivoState.plivoStatus === PlivoStatusEnum.REGISTERED &&
    plivoState.callStatus === PlivoCallStatusEnum.IDLE
  );
};

export const PlivoNumberInput = () => {
  const { t } = useTranslation('frontline');
  const [number, setNumber] = useAtom(plivoNumberAtom);
  const { startCall } = usePlivo();
  const canCall = useCanPlaceCall();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!number.length || !canCall) return;

    startCall(number);
  };

  return (
    <div className="flex items-center flex-col mt-2">
      <form onSubmit={handleSubmit} className="w-full">
        <Input
          className="text-center"
          aria-label={t('plivo-number-to-dial')}
          value={formatPhoneNumber({ value: number, defaultCountry: 'MN' })}
          onChange={(e) => setNumber(e.target.value.replace(' ', ''))}
        />
        <button className="sr-only" type="submit" aria-label={t('call')} />
      </form>
      <div className="pt-3 pb-6 gap-1 grid grid-cols-12 w-full">
        <PlivoNumberInputButton value="1" />
        <PlivoNumberInputButton value="2" />
        <PlivoNumberInputButton value="3" />
        <PlivoNumberInputButton value="4" />
        <PlivoNumberInputButton value="5" />
        <PlivoNumberInputButton value="6" />
        <PlivoNumberInputButton value="7" />
        <PlivoNumberInputButton value="8" />
        <PlivoNumberInputButton value="9" />
        <PlivoNumberInputButton value="0" />
        <PlivoNumberInputButton className="col-span-3" value="+" />
        <PlivoNumberInputButton className="col-span-3" value="#" />
        <PlivoNumberInputButton className="col-span-3" value="*" />
        <PlivoNumberInputButton className="col-span-3 [&>svg]:size-5" remove>
          <IconBackspace />
        </PlivoNumberInputButton>
      </div>
    </div>
  );
};

export const PlivoNumberInputButton = ({
  children,
  value,
  remove,
  className,
}: {
  children?: React.ReactNode;
  value?: string;
  remove?: boolean;
  className?: string;
}) => {
  const { t } = useTranslation('frontline');
  const setNumber = useSetAtom(plivoNumberAtom);

  const handleClick = () => {
    if (remove) {
      setNumber((prev) => prev.slice(0, -1));
      return;
    }

    setNumber((prev) => prev + (value ?? ''));
  };

  return (
    <Button
      type="button"
      variant="secondary"
      // The backspace key is icon-only, so it needs a name of its own.
      aria-label={remove ? t('plivo-delete-digit') : value}
      className={cn('col-span-4 h-9 text-base font-semibold', className)}
      onClick={handleClick}
    >
      {children ?? value}
    </Button>
  );
};
