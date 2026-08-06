import {
  AutomationActionNodeConfigProps,
  AutomationNodeMetaInfoRow,
} from 'ui-modules';

import { TCalcomCancelActionConfigForm } from '../../states/calcomActionConfigFormDefinitions';

const LABELS: Record<string, string> = {
  uid: 'Booking',
  reason: 'Reason',
};

/**
 * Summary shown on the action's node in the builder canvas.
 *
 * An unconfigured node is the normal, working state here rather than an
 * incomplete one — the action falls back to the workflow's own booking — so it
 * says so instead of rendering blank, which would read as "not set up yet".
 */
export const CancelBookingActionNodeContent = ({
  config,
}: AutomationActionNodeConfigProps<TCalcomCancelActionConfigForm>) => {
  const rows = Object.entries(config || {}).filter(
    ([key, value]) => LABELS[key] && value !== undefined && value !== '',
  );

  if (!rows.length) {
    return (
      <AutomationNodeMetaInfoRow
        fieldName="Booking"
        content="The one that triggered this workflow"
      />
    );
  }

  return (
    <div>
      {rows.map(([key, value]) => (
        <AutomationNodeMetaInfoRow
          key={key}
          fieldName={LABELS[key]}
          content={String(value)}
        />
      ))}
    </div>
  );
};
