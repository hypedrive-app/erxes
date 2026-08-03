import {
  createCoreModuleProducerHandler,
  TAutomationProducers,
} from 'erxes-api-shared/core-modules';

import { generateModels } from '~/connectionResolvers';
import { calcomAutomationHandlers } from '@/bookings/meta/automations/automationHandlers';
import { calcomAutomationConstants } from '@/bookings/meta/automations/constants';

const modules = {
  bookings: calcomAutomationHandlers,
};

/**
 * Registers this plugin's automation surface with core.
 *
 * No checkCustomTrigger handler, because none of the triggers are `isCustom` —
 * they are plain event triggers matched by core. A custom trigger declared
 * without a handler does not error; the automation reports success and enrols
 * nobody, which is the worst of both outcomes.
 */
export default {
  constants: calcomAutomationConstants,

  receiveActions: createCoreModuleProducerHandler({
    moduleName: 'automations',
    modules,
    methodName: TAutomationProducers.RECEIVE_ACTIONS,
    extractModuleName: (input) => input.moduleName,
    generateModels,
  }),
};
