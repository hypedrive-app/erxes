import React from 'react';
import { Button } from './button';
import { cn } from '../lib/utils';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { Popover } from './popover';
import { Command } from './command';
import { useInView } from 'react-intersection-observer';
import { mergeRefs } from 'react-merge-refs';
import { Skeleton } from './skeleton';
import type { ApolloError } from '@apollo/client';
import { Spinner } from './spinner';

export const ComboboxTriggerBase = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button> & {
    hideChevron?: boolean;
  }
>(({ className, children, hideChevron = false, ...props }, ref) => {
  return (
    <Popover.Trigger asChild>
      <Button
        ref={ref}
        role="combobox"
        variant="outline"
        {...props}
        type="button"
        className={cn(
          'flex truncate h-8 rounded pl-3 transition-[color,box-shadow] focus-visible:shadow-focus outline-hidden focus-visible:outline-hidden focus-visible:outline-offset-0 focus-visible:outline-transparent justify-start overflow-hidden font-normal text-left w-full gap-1',
          (!props.variant || props.variant === 'outline') && 'shadow-xs',
          props.size === 'lg' && 'gap-2',
          className,
        )}
      >
        {children}
      </Button>
    </Popover.Trigger>
  );
});

export const ComboboxTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button> & {
    hideChevron?: boolean;
  }
>(({ children, hideChevron = false, ...props }, ref) => {
  return (
    <ComboboxTriggerBase {...props} ref={ref}>
      {children}
      {!hideChevron && (
        <IconChevronDown className="size-4 opacity-50 text-muted-foreground  ml-auto" />
      )}
    </ComboboxTriggerBase>
  );
});

ComboboxTrigger.displayName = 'ComboboxTrigger';

export const ComboboxTriggerIcon = React.forwardRef<
  React.ElementRef<typeof IconChevronDown>,
  React.ComponentPropsWithoutRef<typeof IconChevronDown>
>(({ className, ...props }, ref) => {
  return (
    <IconChevronDown
      ref={ref}
      size={16}
      strokeWidth={2}
      aria-hidden="true"
      className={cn('flex-none opacity-50', className)}
      {...props}
    />
  );
});

export const ComboboxValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    placeholder?: string;
    loading?: boolean;
    value?: string | JSX.Element;
  }
>(({ value, className, placeholder, loading, ...props }, ref) => {
  if (loading) {
    return <Skeleton className="w-full flex-1 h-4" />;
  }

  return (
    <span
      ref={ref}
      {...props}
      className={cn('truncate', className, !value && 'text-accent-foreground')}
    >
      {value || placeholder || ''}
    </span>
  );
});

ComboboxValue.displayName = 'ComboboxValue';

export const ComboboxContent = React.forwardRef<
  React.ElementRef<typeof Popover.Content>,
  React.ComponentPropsWithoutRef<typeof Popover.Content>
>(({ className, ...props }, ref) => {
  return (
    <Popover.Content
      ref={ref}
      align="start"
      sideOffset={8}
      {...props}
      className={cn(
        'p-0 min-w-72 w-(--radix-popper-anchor-width) max-w-96',
        className,
      )}
    />
  );
});

ComboboxContent.displayName = 'ComboboxContent';

export const ComboboxCheck = React.forwardRef<
  React.ElementRef<typeof IconCheck>,
  React.ComponentPropsWithoutRef<typeof IconCheck> & {
    checked?: boolean;
  }
>(({ className, checked, ...props }, ref) => {
  if (!checked) {
    return null;
  }

  return (
    <IconCheck
      ref={ref}
      size={16}
      strokeWidth={2}
      className={cn('size-4 text-primary ml-auto', className)}
      {...props}
    />
  );
});

ComboboxCheck.displayName = 'ComboboxCheck';

export const ComboboxFetchMore = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    totalCount: number;
    currentLength: number;
    fetchMore: () => void;
    /**
     * Render as a cmdk item. Only valid inside a <Command> — see the note
     * below on why this is opt-in rather than the default.
     */
    asCommandItem?: boolean;
  }
>(
  (
    { className, totalCount, currentLength, fetchMore, asCommandItem, ...props },
    ref,
  ) => {
    const { ref: bottomRef } = useInView({
      onChange: (inView) => inView && fetchMore(),
    });

    if (currentLength >= totalCount || !totalCount || currentLength === 0) {
      return null;
    }

    const content = (
      <>
        <Spinner
          className="size-4 text-muted-foreground"
          containerClassName="w-auto flex-none mr-2"
        />
        Load more...
      </>
    );

    /**
     * Defaults to a plain <div>, NOT a Command.Item.
     *
     * Command.Item calls cmdk's useCommandState, which reads a context that
     * only exists under a <Command> root. Rendered outside one it does not
     * degrade — it throws
     *   TypeError: Cannot read properties of undefined (reading 'subscribe')
     * at module evaluation of the item, which React escalates to the nearest
     * error boundary. In practice that took out the whole softphone widget:
     * PlivoCallHistory renders this inside a ScrollArea with no Command
     * anywhere, so opening the call-history tab crashed the page and the call
     * bubble never appeared.
     *
     * This is only ever an infinite-scroll sentinel — it is not selectable and
     * has no cmdk value — so nothing is lost by rendering a div. Callers that
     * genuinely sit inside a Command list and want keyboard traversal to reach
     * it can opt in with asCommandItem.
     */
    if (asCommandItem) {
      return (
        <Command.Item
          ref={mergeRefs([ref, bottomRef])}
          {...(props as React.ComponentPropsWithoutRef<typeof Command.Item>)}
          className={cn(className)}
        >
          {content}
        </Command.Item>
      );
    }

    return (
      <div
        ref={mergeRefs([ref, bottomRef])}
        {...props}
        className={cn('flex items-center px-2 py-1.5 text-sm', className)}
      >
        {content}
      </div>
    );
  },
);

ComboboxFetchMore.displayName = 'ComboboxFetchMore';

const ComboboxEmpty = React.forwardRef<
  React.ElementRef<typeof Command.Empty>,
  React.ComponentPropsWithoutRef<typeof Command.Empty> & {
    loading?: boolean;
    error?: ApolloError;
  }
>(({ className, loading, error, ...props }, ref) => {
  return (
    <Command.Empty ref={ref} {...props} className={cn(className)}>
      {loading ? (
        <div className="flex flex-col gap-2 items-start p-4">
          <Skeleton className="w-2/3 h-4" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-32 h-4" />
          <Skeleton className="w-2/3 h-4" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-32 h-4" />
        </div>
      ) : error ? (
        <p className="text-muted-foreground p-8 text-center">{error.message}</p>
      ) : (
        <p className="text-muted-foreground p-8 text-center">
          No results found.
        </p>
      )}
    </Command.Empty>
  );
});

export const Combobox = {
  TriggerBase: ComboboxTriggerBase,
  Trigger: ComboboxTrigger,
  Value: ComboboxValue,
  Content: ComboboxContent,
  Check: ComboboxCheck,
  FetchMore: ComboboxFetchMore,
  Empty: ComboboxEmpty,
};
