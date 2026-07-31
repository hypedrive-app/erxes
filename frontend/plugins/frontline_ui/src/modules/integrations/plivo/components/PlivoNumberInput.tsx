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
            // The number is the one thing on this surface worth reading
            // carefully, so it gets display size and tabular figures — the
            // proportional default made 1s and 7s jitter as digits arrived.
            className="h-11 flex-auto text-center text-lg font-semibold tracking-wide tabular-nums"
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
            className="size-11 flex-none [&>svg]:size-5"
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
          the grid is always full and the block stays a clean rectangle. The
          ITU letter groups are printed under the digits as on a real handset:
          they are how a caller reads a number back off a business card, and
          their absence is most of why a flat grid of digits reads as a form
          rather than as a phone. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <PlivoNumberInputButton value="1" />
        <PlivoNumberInputButton value="2" hint="ABC" />
        <PlivoNumberInputButton value="3" hint="DEF" />
        <PlivoNumberInputButton value="4" hint="GHI" />
        <PlivoNumberInputButton value="5" hint="JKL" />
        <PlivoNumberInputButton value="6" hint="MNO" />
        <PlivoNumberInputButton value="7" hint="PQRS" />
        <PlivoNumberInputButton value="8" hint="TUV" />
        <PlivoNumberInputButton value="9" hint="WXYZ" />
        <PlivoNumberInputButton value="*" />
        {/* `+` is the one hint that is also a long-press action, so it is
            styled as a live affordance rather than as a printed letter group. */}
        <PlivoNumberInputButton value="0" hint="+" longPressValue="+" />
        <PlivoNumberInputButton value="#" />
      </div>
      {/* Long-press is invisible by nature: the `+` under the 0 says something
          is there, and this says what to do to get it. */}
      <p className="mt-2 text-center text-[0.6875rem] leading-none text-accent-foreground">
        {t('plivo-hold-zero-for-plus')}
      </p>
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
        // 48px keys: the letter row needs the vertical room, and it puts the
        // most-pressed control in the widget comfortably past the 44px floor.
        // `active:scale-95` gives the press a physical acknowledgement the flat
        // keys never had, and is dropped for reduced-motion readers.
        'relative h-12 text-base font-semibold tabular-nums transition-transform duration-75 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100',
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
      <span className={cn(hint && '-translate-y-1.5')}>{children ?? value}</span>
      {hint && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-1 leading-none',
            // A letter group is a printed label; `+` is a thing the key will
            // actually do, so it is drawn with the weight of a control.
            longPressValue
              ? 'text-xs font-semibold text-foreground/70'
              : 'text-[0.5625rem] font-medium tracking-[0.08em] text-accent-foreground',
          )}
        >
          {hint}
        </span>
      )}
    </Button>
  );
};
