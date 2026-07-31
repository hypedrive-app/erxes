import { IconBackspace } from '@tabler/icons-react';
import { Button, Input, cn, formatPhoneNumber } from 'erxes-ui';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import { PLIVO_DEFAULT_COUNTRY } from '@/integrations/plivo/utils/plivoPhone';
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
  const { dial } = usePlivoDialer();
  const canCall = useCanPlaceCall();

  // Enter goes through the same dialler as the Call button. Calling `startCall`
  // with the raw atom would hand the SDK exactly what was typed — `99112233`
  // rather than `+97699112233` — which the carrier rejects.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!number.length || !canCall) return;

    dial(number);
  };

  return (
    <div className="flex w-full flex-col">
      <form onSubmit={handleSubmit}>
        {/* The field and the backspace share a row so deleting a mistyped digit
            is next to the digits it edits, rather than stranded in the keypad
            where it stole a key's worth of grid and left the last row ragged. */}
        <div className="flex items-center gap-1">
          <Input
            className="h-10 flex-auto text-center text-base font-medium tracking-wide"
            aria-label={t('plivo-number-to-dial')}
            placeholder={t('plivo-number-to-dial')}
            inputMode="tel"
            autoComplete="tel"
            value={formatPhoneNumber({
              value: number,
              defaultCountry: PLIVO_DEFAULT_COUNTRY,
            })}
            // The displayed value is grouped by `AsYouType`, so an edit hands back
            // a string with EVERY grouping space in it. Stripping only the first
            // (`replace`) left the rest embedded in the atom.
            onChange={(e) => setNumber(e.target.value.replace(/\s/g, ''))}
          />
          <PlivoNumberInputButton
            className="size-10 flex-none [&>svg]:size-5"
            // Nothing to delete on an empty field, so the key says so rather
            // than sitting live and doing nothing.
            disabled={!number.length}
            remove
          >
            <IconBackspace />
          </PlivoNumberInputButton>
        </div>
        {/* Enter dials, matching the Call button. It is a submit rather than a
            key handler so the browser's own form semantics apply; the visible
            Call button below carries the accessible name. */}
        <button className="sr-only" type="submit" tabIndex={-1} aria-hidden />
      </form>
      {/* Canonical 3x4 telephone keypad. Every row is exactly three keys, so
          the grid is always full and the block stays a clean rectangle. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <PlivoNumberInputButton value="1" />
        <PlivoNumberInputButton value="2" />
        <PlivoNumberInputButton value="3" />
        <PlivoNumberInputButton value="4" />
        <PlivoNumberInputButton value="5" />
        <PlivoNumberInputButton value="6" />
        <PlivoNumberInputButton value="7" />
        <PlivoNumberInputButton value="8" />
        <PlivoNumberInputButton value="9" />
        <PlivoNumberInputButton value="*" />
        <PlivoNumberInputButton value="0" hint="+" longPressValue="+" />
        <PlivoNumberInputButton value="#" />
      </div>
    </div>
  );
};

export const PlivoNumberInputButton = ({
  children,
  value,
  remove,
  className,
  disabled,
  hint,
  longPressValue,
}: {
  children?: React.ReactNode;
  value?: string;
  remove?: boolean;
  className?: string;
  disabled?: boolean;
  /** Secondary glyph printed under the digit, as on a physical handset. */
  hint?: string;
  /** Typed instead of `value` when the key is held, the way `0` gives `+`. */
  longPressValue?: string;
}) => {
  const { t } = useTranslation('frontline');
  const setNumber = useSetAtom(plivoNumberAtom);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  const append = (next: string) => setNumber((prev) => prev + next);

  const handleClick = () => {
    if (remove) {
      setNumber((prev) => prev.slice(0, -1));
      return;
    }

    // A completed long press already typed `+`; the click that follows the
    // release must not append the digit on top of it.
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }

    append(value ?? '');
  };

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handlePressStart = () => {
    if (!longPressValue) return;

    didLongPressRef.current = false;
    longPressRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      append(longPressValue);
    }, 500);
  };

  // A press that ends anywhere — release, leaving the key, or the panel
  // unmounting mid-hold — must not leave a timer running.
  useEffect(() => clearLongPress, []);

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled}
      // The backspace key is icon-only, so it needs a name of its own, and the
      // long-press alternative has to be announced rather than only printed.
      aria-label={
        remove
          ? t('plivo-delete-digit')
          : longPressValue
          ? `${value} ${longPressValue}`
          : value
      }
      className={cn(
        'relative h-11 text-base font-semibold tabular-nums',
        className,
      )}
      onClick={handleClick}
      onPointerDown={handlePressStart}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
    >
      {/* Nudged up by half the hint's height so the digit stays optically
          centred in the key rather than sitting high above the hint. */}
      <span className={cn(hint && '-translate-y-1')}>{children ?? value}</span>
      {hint && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-1 text-[0.625rem] font-medium leading-none text-accent-foreground"
        >
          {hint}
        </span>
      )}
    </Button>
  );
};
