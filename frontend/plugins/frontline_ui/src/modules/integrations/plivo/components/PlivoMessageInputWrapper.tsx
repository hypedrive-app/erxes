import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import {
  isInternalState,
  onlyInternalState,
} from '@/inbox/conversations/conversation-detail/states/isInternalState';

/**
 * Locks the composer to internal notes on a phone call thread.
 *
 * A `plivo-call` conversation has no reply channel: the only way to answer a
 * phone call is to place another one, so a composer that offers "Send" is a dead
 * control that fails silently — there is no outbound send path for the kind.
 *
 * The composer is NOT hidden outright, because internal notes DO work here and
 * are the main thing an agent wants after a call: notes go through the ordinary
 * conversation-message mutation, which needs no integration channel at all.
 * This is exactly how the Grandstream `calls` integration already handles its
 * own call threads, so the two behave alike.
 */
export const PlivoMessageInputWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const setIsInternalNote = useSetAtom(isInternalState);
  const setOnlyInternal = useSetAtom(onlyInternalState);

  useEffect(() => {
    setIsInternalNote(true);
    setOnlyInternal(true);

    // Released on the way out so a messenger thread opened next is not left
    // stuck in internal-note-only mode.
    return () => {
      setIsInternalNote(false);
      setOnlyInternal(false);
    };
  }, [setIsInternalNote, setOnlyInternal]);

  return children;
};
