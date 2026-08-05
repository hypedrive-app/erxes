import { IContext } from '~/connectionResolvers';

import {
  CalcomEventTypeInput,
  createCalcomEventType,
  deleteCalcomEventType,
  updateCalcomEventType,
} from '@/eventTypes/calcomApi';

const toDetail = (raw: any) => ({
  id: raw?.id,
  title: raw?.title,
  slug: raw?.slug,
  lengthInMinutes: raw?.lengthInMinutes ?? raw?.length,
  description: raw?.description,
  hidden: raw?.hidden,
  locations: raw?.locations,
});

export const eventTypesMutations = {
  calcomCreateEventType: async (
    _parent: undefined,
    input: CalcomEventTypeInput,
    { models }: IContext,
  ) => {
    const result = await createCalcomEventType(models, input);
    return toDetail(result?.data ?? result);
  },

  calcomUpdateEventType: async (
    _parent: undefined,
    { eventTypeId, ...input }: { eventTypeId: number } & Partial<CalcomEventTypeInput>,
    { models }: IContext,
  ) => {
    const result = await updateCalcomEventType(models, eventTypeId, input);
    return toDetail(result?.data ?? result);
  },

  calcomDeleteEventType: async (
    _parent: undefined,
    { eventTypeId }: { eventTypeId: number },
    { models }: IContext,
  ) => {
    await deleteCalcomEventType(models, eventTypeId);
    return { ok: true, uid: String(eventTypeId) };
  },
};
