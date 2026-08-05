import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Button, cn } from 'erxes-ui';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { Popover as PopoverPrimitive, Portal } from 'radix-ui';
import {
  plivoStateAtom,
  plivoWidgetOpenAtom,
  plivoWidgetPositionAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallDirectionEnum,
  PlivoCallStatusEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';
import { useCallUserIntegration } from '@/integrations/call/hooks/useCallUserIntegration';

/**
 * Keeps the launcher inside the viewport, with its resting inset intact.
 *
 * The button is laid out at `bottom-8` and (absent the Grandstream widget)
 * `right-8` — a 32px inset — and this offset is added on top of that. A
 * positive offset therefore eats into the inset, and the previous
 * `Math.min(32, …)` upper bound allowed exactly enough to cancel it: a stored
 * `{x:32, y:32}` put the button flush into the corner with zero margin on
 * every viewport, which at 375px reads as clipped rather than placed.
 * Clamping at 0 keeps the inset as the closest the launcher can sit to the
 * corner, while dragging away from it stays free down to the opposite edge.
 */
const LAUNCHER_INSET = 32;
const LAUNCHER_SIZE = 56;

const clampToViewport = (x: number, y: number) => ({
  x: Math.min(
    0,
    Math.max((window.innerWidth - LAUNCHER_INSET - LAUNCHER_SIZE) * -1, x),
  ),
  y: Math.min(
    0,
    Math.max((window.innerHeight - LAUNCHER_INSET - LAUNCHER_SIZE) * -1, y),
  ),
});

const PlivoWidgetDraggable = memo(
  ({
    children,
    trigger,
    label,
    position,
  }: {
    children: React.ReactNode;
    trigger: React.ReactNode;
    label: string;
    position: { x: number; y: number };
  }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: 'plivo-widget',
    });
    const [open, setOpen] = useAtom(plivoWidgetOpenAtom);
    const { plivoStatus, callStatus, callDirection } =
      useAtomValue(plivoStateAtom);

    const isOnline = plivoStatus === PlivoStatusEnum.REGISTERED;
    const isActive = callStatus === PlivoCallStatusEnum.ACTIVE;
    const isRinging =
      callDirection === PlivoCallDirectionEnum.INCOMING &&
      callStatus === PlivoCallStatusEnum.STARTING;

    // SipContainer renders nothing when the account has no call integration,
    // so its slot at right-10 is only taken when one exists.
    const { callUserIntegrations } = useCallUserIntegration();
    const hasSipWidget = Boolean(callUserIntegrations?.length);

    const style = useMemo(
      () => ({
        transform: `translate(${position.x + (transform?.x ?? 0)}px, ${
          position.y + (transform?.y ?? 0)
        }px)`,
      }),
      [position.x, position.y, transform?.x, transform?.y],
    );

    return (
      <Portal.Root>
        <PopoverPrimitive.Trigger ref={setNodeRef} style={style} asChild>
          <Button
            variant="secondary"
            size="icon"
            aria-label={label}
            className={cn(
              // The Grandstream widget occupies right-10. This one sits beside
              // it ONLY when that one is actually there — SipContainer renders
              // nothing without a call integration, and offsetting past an
              // empty slot leaves this button stranded in open space, which
              // reads as a misplaced control rather than a deliberate pair.
              'fixed bottom-8 size-14 rounded-full border border-background/80 shadow-xl ring-1 ring-black/5 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              hasSipWidget ? 'right-28' : 'right-8',
              // A ringing call gets a ring rather than a different fill: the
              // launcher may be anywhere on screen after a drag, and a halo
              // reads as "this is happening now" from the corner of the eye in
              // a way a hue swap on a 48px circle does not.
              isRinging &&
                'ring-4 ring-success/30 motion-safe:animate-pulse',
              isActive
                ? 'bg-primary hover:bg-primary/90'
                : isOnline
                  ? 'bg-success hover:bg-success/90'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
            onClick={() => setOpen(!open)}
            {...listeners}
            {...attributes}
          >
            {trigger}
          </Button>
        </PopoverPrimitive.Trigger>

        {children}
      </Portal.Root>
    );
  },
);

PlivoWidgetDraggable.displayName = 'PlivoWidgetDraggable';

export const PlivoWidgetDraggableRoot = ({
  children,
  trigger,
  label,
}: {
  children: React.ReactNode;
  trigger: React.ReactNode;
  label: string;
}) => {
  const setOpen = useSetAtom(plivoWidgetOpenAtom);
  const [position, setPosition] = useAtom(plivoWidgetPositionAtom);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 10 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { delta } = event;
      setPosition((prev) => clampToViewport(prev.x + delta.x, prev.y + delta.y));
    },
    [setPosition],
  );

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampToViewport(prev.x, prev.y));
    };

    // The stored offset was clamped against whatever viewport it was dragged
    // in, and `atomWithStorage` restores it verbatim. Opening the same account
    // on a narrower screen — or on a phone — therefore replayed an offset that
    // is out of bounds there: a saved {x:40,y:40} pinned the launcher hard into
    // the corner at 375px with no margin at all. `resize` never fires on a
    // fresh load, so the restored value has to be re-clamped once on mount for
    // the viewport it is actually being shown in.
    handleResize();

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [setPosition]);

  return (
    <DndContext
      onDragEnd={handleDragEnd}
      onDragStart={() => setOpen(false)}
      sensors={sensors}
    >
      <PlivoWidgetDraggable position={position} trigger={trigger} label={label}>
        {children}
      </PlivoWidgetDraggable>
    </DndContext>
  );
};
