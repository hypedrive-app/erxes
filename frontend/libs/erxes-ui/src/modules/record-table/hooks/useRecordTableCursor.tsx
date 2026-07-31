import { useAtom } from 'jotai';
import { useEffect } from 'react';
import { recordTableCursorAtomFamily } from '../states/RecordTableCursorState';

// A valid cursor is base64(JSON) carrying at least an `_id` (see the server's
// encodeCursor/decodeCursor). A raw row id, an empty string, or any other
// leftover value would be rejected server-side as "Invalid cursor format" and
// error the list query into a blank table. Treat anything that isn't a proper
// opaque cursor as "no cursor" so the table loads from the first page instead.
const isValidCursor = (value: string | null): value is string => {
  if (!value) return false;
  try {
    const decoded = JSON.parse(atob(value));
    return typeof decoded === 'object' && decoded !== null && '_id' in decoded;
  } catch {
    return false;
  }
};

export const useRecordTableCursor = ({
  sessionKey,
}: {
  sessionKey?: string;
}) => {
  const [cursor, setCursor] = useAtom(
    recordTableCursorAtomFamily(sessionKey ?? '') ?? '',
  );

  useEffect(() => {
    if (!sessionKey) return;
    const stored = sessionStorage.getItem(sessionKey);
    if (isValidCursor(stored)) {
      setCursor(stored);
    } else {
      // Purge a poisoned/legacy value so it can't be re-read next time.
      if (stored) sessionStorage.removeItem(sessionKey);
      setCursor('');
    }
  }, [sessionKey, setCursor]);

  return {
    cursor,
    setCursor,
  };
};
