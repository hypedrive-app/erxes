export const types = `
  type CalcomScheduleAvailability {
    days: [String]
    startTime: String
    endTime: String
  }

  type CalcomScheduleOverride {
    date: String
    startTime: String
    endTime: String
  }

  """
  A working-hours schedule, read/written live against Cal.com.

  Not mirrored: availability is computed against calendars erxes cannot see,
  so a cached copy would be stale the moment a calendar changed — same
  reasoning as CalcomSlot in bookings' schema.
  """
  type CalcomSchedule {
    id: Int
    name: String
    timeZone: String
    isDefault: Boolean
    availability: [CalcomScheduleAvailability]
    overrides: [CalcomScheduleOverride]
  }

  input CalcomScheduleAvailabilityInput {
    days: [String!]!
    startTime: String!
    endTime: String!
  }

  input CalcomScheduleOverrideInput {
    date: String!
    startTime: String!
    endTime: String!
  }
`;

export const queries = `
  calcomSchedules: [CalcomSchedule]
  calcomSchedule(scheduleId: Int!): CalcomSchedule
  calcomDefaultSchedule: CalcomSchedule
`;

export const mutations = `
  calcomCreateSchedule(
    name: String!
    timeZone: String!
    isDefault: Boolean!
    availability: [CalcomScheduleAvailabilityInput!]
    overrides: [CalcomScheduleOverrideInput!]
  ): CalcomSchedule

  calcomUpdateSchedule(
    scheduleId: Int!
    name: String
    timeZone: String
    isDefault: Boolean
    availability: [CalcomScheduleAvailabilityInput!]
    overrides: [CalcomScheduleOverrideInput!]
  ): CalcomSchedule

  calcomDeleteSchedule(scheduleId: Int!): CalcomWriteResult
`;
