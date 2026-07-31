import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { usePlivo } from '@/integrations/plivo/components/PlivoProvider';
import {
  plivoDialRequestAtom,
  plivoNumberAtom,
  plivoReadyAtom,
  plivoStateAtom,
  plivoUiAtom,
  plivoWidgetOpenAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallStatusEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

/**
 * Bridges call requests raised outside the softphone into the Plivo client.
 *
 * Mounted inside the provider, it is the only place that turns a
 * `plivoDialRequestAtom` entry into an actual call. It also publishes whether
 * the phone can place one, which is what call buttons elsewhere in the app gate
 * themselves on — they cannot read the provider's context across the module
 * federation boundary.
 *
 * Renders nothing; this is host-level wiring, matching the `*Effect` components
 * used elsewhere in the app.
 */
export const PlivoDialRequestEffect = () => {
  const { startCall } = usePlivo();
  const { plivoStatus, callStatus } = useAtomValue(plivoStateAtom);
  const [dialRequest, setDialRequest] = useAtom(plivoDialRequestAtom);
  const setReady = useSetAtom(plivoReadyAtom);
  const setNumber = useSetAtom(plivoNumberAtom);
  const setPlivoUi = useSetAtom(plivoUiAtom);
  const setWidgetOpen = useSetAtom(plivoWidgetOpenAtom);

  const canPlaceCall =
    plivoStatus === PlivoStatusEnum.REGISTERED &&
    callStatus === PlivoCallStatusEnum.IDLE;

  useEffect(() => {
    setReady(canPlaceCall);
  }, [canPlaceCall, setReady]);

  // The provider is unmounted when the agent goes offline or the account loses
  // its integration; leaving `ready` true would strand call buttons on screen.
  useEffect(() => {
    return () => setReady(false);
  }, [setReady]);

  useEffect(() => {
    if (!dialRequest) return;

    // A request that arrives mid-call is dropped rather than queued: by the time
    // the current call ends the agent's intent is stale, and silently dialling
    // then would be worse than doing nothing.
    if (!canPlaceCall) {
      setDialRequest(null);
      return;
    }

    setDialRequest(null);
    setNumber(dialRequest.destination);
    // The panel remembers whichever tab was last used, so a call started from
    // the history tab (its own call-back button) would open the widget onto
    // history and hide the call it just placed until the status left IDLE.
    setPlivoUi('keypad');
    setWidgetOpen(true);
    startCall(dialRequest.destination);
  }, [
    dialRequest,
    canPlaceCall,
    setDialRequest,
    setNumber,
    setPlivoUi,
    setWidgetOpen,
    startCall,
  ]);

  return null;
};
