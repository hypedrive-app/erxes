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
import { PlivoStatusEnum } from '@/integrations/plivo/types/plivoTypes';

/** Keeps the launcher inside the viewport, matching the Grandstream widget. */
const clampToViewport = (x: number, y: number) => ({
  x: Math.min(40, Math.max((window.innerWidth - 88) * -1, x)),
  y: Math.min(40, Math.max((window.innerHeight - 88) * -1, y)),
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
    const { plivoStatus } = useAtomValue(plivoStateAtom);

    const isOnline = plivoStatus === PlivoStatusEnum.REGISTERED;

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
              'fixed bottom-10 right-28 size-12 [&>svg]:size-6 rounded-full shadow-lg',
              isOnline
                ? 'bg-success hover:bg-success/90'
                : 'bg-destructive hover:bg-destructive/90',
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
