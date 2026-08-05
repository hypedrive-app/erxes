import { IContext } from '~/connectionResolvers';

import { getCalcomEventType } from '@/eventTypes/calcomApi';

export const eventTypesQueries = {
  calcomEventType: async (
    _parent: undefined,
    { eventTypeId }: { eventTypeId: number },
    { models }: IContext,
  ) => {
    const result = await getCalcomEventType(models, eventTypeId);
    const data = result?.data ?? result;

    if (!data?.id) return null;

    return {
      id: data.id,
      title: data.title,
      slug: data.slug,
      lengthInMinutes: data.lengthInMinutes ?? data.length,
      description: data.description,
      hidden: data.hidden,
      locations: data.locations,
    };
  },
};
