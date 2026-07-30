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
