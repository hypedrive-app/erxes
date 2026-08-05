import { gql } from '@apollo/client';

export const CALCOM_SCHEDULE_FIELDS = gql`
  fragment CalcomScheduleFields on CalcomSchedule {
    id
    name
    timeZone
    isDefault
    availability {
      days
      startTime
      endTime
    }
  }
`;

export const CALCOM_SCHEDULES_QUERY = gql`
  query CalcomSchedules {
    calcomSchedules {
      ...CalcomScheduleFields
    }
  }
  ${CALCOM_SCHEDULE_FIELDS}
`;

export const CALCOM_CREATE_SCHEDULE = gql`
  mutation CalcomCreateSchedule(
    $name: String!
    $timeZone: String!
    $isDefault: Boolean!
    $availability: [CalcomScheduleAvailabilityInput!]
  ) {
    calcomCreateSchedule(
      name: $name
      timeZone: $timeZone
      isDefault: $isDefault
      availability: $availability
    ) {
      ...CalcomScheduleFields
    }
  }
  ${CALCOM_SCHEDULE_FIELDS}
`;

export const CALCOM_UPDATE_SCHEDULE = gql`
  mutation CalcomUpdateSchedule(
    $scheduleId: Int!
    $name: String
    $timeZone: String
    $isDefault: Boolean
    $availability: [CalcomScheduleAvailabilityInput!]
  ) {
    calcomUpdateSchedule(
      scheduleId: $scheduleId
      name: $name
      timeZone: $timeZone
      isDefault: $isDefault
      availability: $availability
    ) {
      ...CalcomScheduleFields
    }
  }
  ${CALCOM_SCHEDULE_FIELDS}
`;

export const CALCOM_DELETE_SCHEDULE = gql`
  mutation CalcomDeleteSchedule($scheduleId: Int!) {
    calcomDeleteSchedule(scheduleId: $scheduleId) {
      ok
    }
  }
`;
