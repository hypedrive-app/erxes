import WebhooksComponents from '@/automations/components/builder/nodes/triggers/webhooks/Webhooks';
import { LazyAutomationComponent } from '@/automations/types';
import { lazy } from 'react';

const coreTriggers = {
  ...WebhooksComponents,
  schedules: {
    sidebar: lazy(() =>
      import(
        '@/automations/components/builder/nodes/triggers/schedules/ScheduleConfigForm'
      ).then((module) => ({ default: module.ScheduleConfigForm })),
    ),
    nodeContent: lazy(() =>
      import(
        '@/automations/components/builder/nodes/triggers/schedules/ScheduleNodeContent'
      ).then((module) => ({ default: module.ScheduleNodeContent })),
    ),
  },
};

type TriggerName = keyof typeof coreTriggers;
export enum TAutomationTriggerComponent {
  Sidebar = 'sidebar',
  NodeContent = 'nodeContent',
}
type TriggerComponents = {
  sidebar?: LazyAutomationComponent<any>;
  nodeContent?: LazyAutomationComponent<any>;
};

// Trigger names arrive as free-form strings parsed out of a node type, so these
// take `string` and narrow it — that check is the whole point of the guard.
export function isCoreAutomationTriggerType(
  triggerName: string,
  componentType: TAutomationTriggerComponent,
): triggerName is TriggerName {
  const trigger: TriggerComponents | undefined = Object.prototype.hasOwnProperty.call(
    coreTriggers,
    triggerName,
  )
    ? coreTriggers[triggerName as TriggerName]
    : undefined;
  return trigger !== undefined && componentType in trigger;
}

// // Alternative version that returns the component if it exists
export function getCoreAutomationTriggerComponent(
  triggerName: string,
  componentType: TAutomationTriggerComponent,
): React.LazyExoticComponent<React.ComponentType<any>> | null {
  if (isCoreAutomationTriggerType(triggerName, componentType)) {
    return (
      (coreTriggers[triggerName] as TriggerComponents)?.[componentType] ?? null
    );
  }
  return null;
}
