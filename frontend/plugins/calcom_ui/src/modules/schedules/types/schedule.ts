export interface ICalcomScheduleAvailability {
  days: string[];
  startTime: string;
  endTime: string;
}

export interface ICalcomSchedule {
  id: number;
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability?: ICalcomScheduleAvailability[];
}
