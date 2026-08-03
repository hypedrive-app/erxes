import {
  TAutomationProducers,
  TAutomationProducersInput,
  TCoreModuleProducerContext,
} from 'erxes-api-shared/core-modules';

import { IModels } from '~/connectionResolvers';
import { cancelCalcomBooking } from '@/bookings/calcomApi';

/**
 * Resolves the booking a rule is acting on.
 *
 * A rule can be triggered by a booking event (target carries the uid) or reach
 * a booking from elsewhere in the graph (config names it explicitly), so both
 * are accepted. Falling back to the trigger's own target is what lets
 * "when a booking is created, cancel it" work without configuration.
 */
const resolveUid = (action: any, execution: any): string | undefined =>
  action?.config?.uid || execution?.target?.uid;

export const calcomAutomationHandlers = {
  receiveActions: async (
    {
      action,
      execution,
      collectionType,
    }: TAutomationProducersInput[TAutomationProducers.RECEIVE_ACTIONS],
    _ctx: TCoreModuleProducerContext<IModels>,
  ) => {
    if (collectionType !== 'bookings') {
      throw new Error(`Unsupported Cal.com automation action: ${collectionType}`);
    }

    const uid = resolveUid(action, execution);

    if (!uid) {
      // Thrown, not returned as a soft failure: an action that cannot identify
      // its booking has not done anything, and reporting success would leave
      // the run looking like it worked.
      throw new Error('Cal.com action has no booking uid to act on');
    }

    const result = await cancelCalcomBooking(uid, action?.config?.reason);

    // Deliberately does not write to the mirror. Cal.com answers this call and
    // then sends BOOKING_CANCELLED, and letting the webhook be the only writer
    // keeps one write path instead of two that can disagree.
    return { uid, cancelled: true, result };
  },
};
