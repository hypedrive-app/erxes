export interface ICalcomEventTypeListItem {
  id: number;
  title: string;
  slug: string;
  length?: number;
  description?: string;
  hidden?: boolean;
}

export interface ICalcomEventTypeDetail {
  id: number;
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  hidden?: boolean;
}
