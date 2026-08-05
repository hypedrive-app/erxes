import { IContext } from '~/connectionResolvers';

import {
  CalcomScheduleInput,
  createCalcomSchedule,
  deleteCalcomSchedule,
  updateCalcomSchedule,
} from '@/schedules/calcomApi';

const toSchedule = (raw: any) => ({
  id: raw?.id,
  name: raw?.name,
  timeZone: raw?.timeZone,
  isDefault: raw?.isDefault,
  availability: raw?.availability,
  overrides: raw?.overrides,
});

export const schedulesMutations = {
  calcomCreateSchedule: async (
    _parent: undefined,
    input: CalcomScheduleInput,
    { models }: IContext,
  ) => {
    const result = await createCalcomSchedule(models, input);
    return toSchedule(result?.data ?? result);
  },

  calcomUpdateSchedule: async (
    _parent: undefined,
    { scheduleId, ...input }: { scheduleId: number } & Partial<CalcomScheduleInput>,
    { models }: IContext,
  ) => {
    const result = await updateCalcomSchedule(models, scheduleId, input);
    return toSchedule(result?.data ?? result);
  },

  calcomDeleteSchedule: async (
    _parent: undefined,
    { scheduleId }: { scheduleId: number },
    { models }: IContext,
  ) => {
    await deleteCalcomSchedule(models, scheduleId);
    return { ok: true, uid: String(scheduleId) };
  },
};
