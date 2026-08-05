import { IContext } from '~/connectionResolvers';

import {
  getCalcomDefaultSchedule,
  getCalcomSchedule,
  listCalcomSchedules,
} from '@/schedules/calcomApi';

const toSchedule = (raw: any) => ({
  id: raw?.id,
  name: raw?.name,
  timeZone: raw?.timeZone,
  isDefault: raw?.isDefault,
  availability: raw?.availability,
  overrides: raw?.overrides,
});

export const schedulesQueries = {
  calcomSchedules: async (
    _parent: undefined,
    _args: undefined,
    { models }: IContext,
  ) => {
    const result = await listCalcomSchedules(models);
    const raw: any[] = Array.isArray(result) ? result : result?.data || [];

    return raw.map(toSchedule);
  },

  calcomSchedule: async (
    _parent: undefined,
    { scheduleId }: { scheduleId: number },
    { models }: IContext,
  ) => {
    const result = await getCalcomSchedule(models, scheduleId);
    const data = result?.data ?? result;

    return data?.id ? toSchedule(data) : null;
  },

  calcomDefaultSchedule: async (
    _parent: undefined,
    _args: undefined,
    { models }: IContext,
  ) => {
    const result = await getCalcomDefaultSchedule(models);
    const data = result?.data ?? result;

    return data?.id ? toSchedule(data) : null;
  },
};
