import { IModels } from '~/connectionResolvers';

import { calcomRequest } from '@/bookings/calcomApi';

/**
 * Cal.com v2 event-types CRUD.
 *
 * Configuration, not events: nothing here is fed by a webhook, and nothing is
 * mirrored — every read goes straight to Cal.com, same as bookings/calcomApi's
 * own listCalcomEventTypes (used there for a "book a time" dropdown). This
 * file is what lets erxes also WRITE the event type, not just pick from it.
 *
 * `2024-06-14` is the version this endpoint expects — see bookings/calcomApi's
 * note on why the header cannot be one blanket value across endpoints.
 */
const API_VERSION_EVENT_TYPES = '2024-06-14';

export interface CalcomEventTypeLocationInput {
  type: string;
  [key: string]: unknown;
}

export interface CalcomEventTypeInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  locations?: CalcomEventTypeLocationInput[];
  hidden?: boolean;
}

export const listCalcomEventTypesFull = async (
  models: IModels | undefined,
  username?: string,
): Promise<any> =>
  calcomRequest('/event-types', {
    method: 'GET',
    query: { username },
    apiVersion: API_VERSION_EVENT_TYPES,
    models,
  });

export const getCalcomEventType = async (
  models: IModels | undefined,
  eventTypeId: number,
): Promise<any> =>
  calcomRequest(`/event-types/${encodeURIComponent(String(eventTypeId))}`, {
    method: 'GET',
    apiVersion: API_VERSION_EVENT_TYPES,
    models,
  });

export const createCalcomEventType = async (
  models: IModels | undefined,
  input: CalcomEventTypeInput,
): Promise<any> =>
  calcomRequest('/event-types', {
    method: 'POST',
    body: input,
    apiVersion: API_VERSION_EVENT_TYPES,
    models,
  });

export const updateCalcomEventType = async (
  models: IModels | undefined,
  eventTypeId: number,
  input: Partial<CalcomEventTypeInput>,
): Promise<any> =>
  calcomRequest(`/event-types/${encodeURIComponent(String(eventTypeId))}`, {
    method: 'PATCH',
    body: input,
    apiVersion: API_VERSION_EVENT_TYPES,
    models,
  });

export const deleteCalcomEventType = async (
  models: IModels | undefined,
  eventTypeId: number,
): Promise<any> =>
  calcomRequest(`/event-types/${encodeURIComponent(String(eventTypeId))}`, {
    method: 'DELETE',
    apiVersion: API_VERSION_EVENT_TYPES,
    models,
  });
