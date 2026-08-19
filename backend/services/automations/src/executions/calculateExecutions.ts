import { IModels } from '../connectionResolver';
import { resolveAutomationErrorCode } from './errorCodes';
import { isInSegment } from '../utils/isInSegment';
import { isDiffValue } from '../utils/utils';
import {
  AUTOMATION_EXECUTION_STATUS,
  IAutomationExecutionDocument,
  IAutomationTrigger,
  splitType,
  TAutomationProducers,
} from 'erxes-api-shared/core-modules';
import { sendCoreModuleProducer } from 'erxes-api-shared/utils';

const checkIsValidCustomTigger = async (
  type: string,
  subdomain: string,
  automationId: string,
  trigger: IAutomationTrigger,
  target: any,
  config: any,
  eventUpdateDescription?: Record<string, any>,
) => {
  const [pluginName, moduleName, collectionType, relationType] =
    splitType(type);
  const response = await sendCoreModuleProducer({
    moduleName: 'automations',
    subdomain,
    pluginName,
    producerName: TAutomationProducers.CHECK_CUSTOM_TRIGGER,
    input: {
      moduleName,
      collectionType,
      relationType,
      automationId,
      trigger,
      target,
      config,
      eventUpdateDescription,
    },
    // A plugin that is down, absent from ENABLED_PLUGINS, or throwing inside
    // its own checkCustomTrigger must not read as "this record does not match".
    // The throw reaches calculateExecution's catch, which records an execution
    // row with status ERROR and the message on it — the outcome this code
    // always intended, and which the old `defaultValue: false` silently
    // replaced with "no match" and no row at all.
    throwOnFailure: true,
  });

  return response;
};

const checkValidTrigger = async (
  trigger: IAutomationTrigger,
  target: any,
  subdomain: string,
  automationId: string,
  eventUpdateDescription?: Record<string, any>,
) => {
  const { type = '', config, isCustom } = trigger;
  const { contentId } = config || {};
  if (Boolean(isCustom)) {
    const isValidCustomTigger = await checkIsValidCustomTigger(
      type,
      subdomain,
      automationId,
      trigger,
      target,
      config,
      eventUpdateDescription,
    );

    return isValidCustomTigger;
  }

  // An unset contentId means the trigger carries no segment filter, so every
  // record of its content type qualifies. Passing it through anyway made
  // `Segments.getSegment('')` throw 'Segment not found'; sendTRPCMessage
  // catches every error and substitutes its default, which is `false`, so the
  // trigger was rejected silently — no execution row, not even a failed one,
  // and a 15s delay burned per event on the way to that non-answer.
  //
  // This only concerns the non-custom path. A custom trigger returns above and
  // never reaches here, which matters because `contentId` does not mean the
  // same thing there: sales' stageChanged handler reads it as a PIPELINE id,
  // not a segment.
  if (!contentId) {
    return true;
  }

  if (!(await isInSegment(subdomain, contentId, target._id))) {
    return false;
  }

  return true;
};

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const buildExecutionTarget = (
  target: any,
  eventUpdateDescription?: Record<string, any>,
) => {
  const updated = eventUpdateDescription?.updated || {};
  const eventFields = Object.entries(updated).reduce(
    (acc, [field, change]: [string, any]) => {
      if (!change || typeof change !== 'object') {
        return acc;
      }

      const fieldName = capitalize(field);

      return {
        ...acc,
        [`previous${fieldName}`]: change.prev,
        [`current${fieldName}`]: change.current,
      };
    },
    {} as Record<string, any>,
  );

  return {
    ...target,
    ...eventFields,
    eventUpdateDescription,
  };
};

export const calculateExecution = async ({
  models,
  subdomain,
  automationId,
  trigger,
  target,
  eventUpdateDescription,
}: {
  models: IModels;
  subdomain: string;
  automationId: string;
  trigger: IAutomationTrigger;
  target: any;
  eventUpdateDescription?: Record<string, any>;
}): Promise<IAutomationExecutionDocument | null | undefined> => {
  const { id, type = '', config } = trigger;
  const { reEnrollment, reEnrollmentRules = [] } = config || {};
  const executionTarget = buildExecutionTarget(target, eventUpdateDescription);

  try {
    const isValidTrigger = await checkValidTrigger(
      trigger,
      executionTarget,
      subdomain,
      automationId,
      eventUpdateDescription,
    );
    if (!isValidTrigger) {
      return;
    }
  } catch (e) {
    await models.Executions.create({
      automationId,
      triggerId: id,
      triggerType: type,
      triggerConfig: config,
      targetId: executionTarget._id,
      target: executionTarget,
      status: AUTOMATION_EXECUTION_STATUS.ERROR,
      description: `An error occurred while checking the is in segment: "${e.message}"`,
      errorCode: resolveAutomationErrorCode(e),
      createdAt: new Date(),
    });
    return;
  }

  const latestExecution = await models.Executions.findOne({
    automationId,
    triggerId: id,
    targetId: target._id,
    status: { $ne: AUTOMATION_EXECUTION_STATUS.ERROR },
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  if (latestExecution) {
    if (!reEnrollment || !reEnrollmentRules.length) {
      return;
    }

    let isChanged = false;

    for (const reEnrollmentRule of reEnrollmentRules) {
      if (
        isDiffValue(latestExecution.target, executionTarget, reEnrollmentRule)
      ) {
        isChanged = true;
        break;
      }
    }

    if (!isChanged) {
      return;
    }
  }

  return models.Executions.create({
    automationId,
    triggerId: id,
    triggerType: type,
    triggerConfig: config,
    targetId: executionTarget._id,
    target: executionTarget,
    status: AUTOMATION_EXECUTION_STATUS.ACTIVE,
    description: `Met enrollment criteria`,
    createdAt: new Date(),
  });
};
