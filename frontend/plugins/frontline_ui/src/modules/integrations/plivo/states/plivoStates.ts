import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  IPlivoState,
  PlivoCallQualityEnum,
  PlivoCallStatusEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

export const plivoStateAtom = atom<IPlivoState>({
  plivoStatus: PlivoStatusEnum.DISCONNECTED,
  plivoErrorType: null,
  plivoErrorMessage: null,
  callStatus: PlivoCallStatusEnum.IDLE,
  callDirection: null,
  callCounterpart: null,
  callerName: null,
  callId: null,
  callQuality: PlivoCallQualityEnum.UNKNOWN,
  isMuted: false,
});

/** Number typed into the Plivo dialpad, before it is dialled. */
export const plivoNumberAtom = atom<string>('');

/** Which surface the softphone panel is showing: the keypad or the contacts. */
export const plivoUiAtom = atom<string>('keypad');

/** Whether the floating softphone panel is expanded. */
export const plivoWidgetOpenAtom = atom<boolean>(false);

/**
 * When the current call was answered, so the timer survives the panel being
 * collapsed and can also be rendered on the floating launcher.
 */
export const plivoCallStartedAtAtom = atom<Date | null>(null);

/**
 * Drag offset of the floating launcher, kept separate from the Grandstream
 * widget's own position so the two buttons cannot end up stacked on top of
 * each other when an account runs both providers.
 */
export const plivoWidgetPositionAtom = atomWithStorage<{
  x: number;
  y: number;
}>('plivo:widgetPosition', { x: 0, y: 0 }, undefined, { getOnInit: true });

/**
 * Set when the agent deliberately goes offline, so a remount does not silently
 * log them back in and start ringing their browser again.
 */
export const plivoUnregisteredAtom = atomWithStorage<boolean>(
  'plivo:unregistered',
  false,
  undefined,
  { getOnInit: true },
);

/** Which Plivo integration the agent is answering for. */
export const plivoIntegrationIdAtom = atomWithStorage<string | null>(
  'plivo:integrationId',
  null,
  undefined,
  { getOnInit: true },
);

/**
 * A request to dial, raised by a surface outside the softphone.
 *
 * The provider is mounted inside the `floatingWidget` federation entry, while
 * call buttons live on pages served from other entries (`frontline`, and any
 * future host surface). Those are sibling React trees, so the Plivo context
 * cannot be read across them — but `jotai` is a shared singleton library, so an
 * atom is the one channel both sides genuinely share.
 *
 * The value carries an `id` as well as the number so that dialling the same
 * number twice in a row is still seen as two distinct requests. The widget
 * clears it back to `null` once consumed.
 */
export const plivoDialRequestAtom = atom<{
  id: number;
  destination: string;
} | null>(null);

/**
 * Whether a softphone is mounted and logged in, published for the same
 * cross-entry reason as `plivoDialRequestAtom`.
 *
 * Call buttons on other surfaces render only when this is true, so an account
 * with no Plivo number — or an agent who has gone offline — is never offered a
 * button that could not place a call.
 */
export const plivoReadyAtom = atom<boolean>(false);
