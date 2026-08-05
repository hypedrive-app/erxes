import { IModels } from '~/connectionResolvers';

import { calcomRequest } from '@/bookings/calcomApi';

/**
 * Cal.com v2 schedules (availability) CRUD.
 *
 * Same rationale as eventTypes/calcomApi: availability is Cal.com
 * configuration, computed against calendars erxes cannot see, so it is read
 * and written live rather than mirrored.
 *
 * `2024-06-11` is what /v2/schedules expects — distinct from the bookings
 * (2024-08-13) and event-types (2024-06-14) tracks.
 */
const API_VERSION_SCHEDULES = '2024-06-11';

export interface CalcomScheduleAvailabilityInput {
  days: string[];
  startTime: string;
  endTime: string;
}

export interface CalcomScheduleOverrideInput {
  date: string;
  startTime: string;
  endTime: string;
}

export interface CalcomScheduleInput {
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability?: CalcomScheduleAvailabilityInput[];
  overrides?: CalcomScheduleOverrideInput[];
}

export const listCalcomSchedules = async (
  models: IModels | undefined,
): Promise<any> =>
  calcomRequest('/schedules', {
    method: 'GET',
    apiVersion: API_VERSION_SCHEDULES,
    models,
  });

export const getCalcomDefaultSchedule = async (
  models: IModels | undefined,
): Promise<any> =>
  calcomRequest('/schedules/default', {
    method: 'GET',
    apiVersion: API_VERSION_SCHEDULES,
    models,
  });

export const getCalcomSchedule = async (
  models: IModels | undefined,
  scheduleId: number,
): Promise<any> =>
  calcomRequest(`/schedules/${encodeURIComponent(String(scheduleId))}`, {
    method: 'GET',
    apiVersion: API_VERSION_SCHEDULES,
    models,
  });

export const createCalcomSchedule = async (
  models: IModels | undefined,
  input: CalcomScheduleInput,
): Promise<any> =>
  calcomRequest('/schedules', {
    method: 'POST',
    body: input,
    apiVersion: API_VERSION_SCHEDULES,
    models,
  });

export const updateCalcomSchedule = async (
  models: IModels | undefined,
  scheduleId: number,
  input: Partial<CalcomScheduleInput>,
): Promise<any> =>
  calcomRequest(`/schedules/${encodeURIComponent(String(scheduleId))}`, {
    method: 'PATCH',
    body: input,
    apiVersion: API_VERSION_SCHEDULES,
    models,
  });

export const deleteCalcomSchedule = async (
  models: IModels | undefined,
  scheduleId: number,
): Promise<any> =>
  calcomRequest(`/schedules/${encodeURIComponent(String(scheduleId))}`, {
    method: 'DELETE',
    apiVersion: API_VERSION_SCHEDULES,
    models,
  });
