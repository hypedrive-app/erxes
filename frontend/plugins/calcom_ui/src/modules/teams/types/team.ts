export interface ICalcomTeam {
  id: number;
  name: string;
  slug?: string;
  logoUrl?: string;
  bio?: string;
}

export interface ICalcomTeamMembership {
  id: number;
  userId: number;
  teamId: number;
  role?: string;
  accepted?: boolean;
}

export interface ICalcomTeamEventType {
  id: number;
  teamId: number;
  title: string;
  slug: string;
  lengthInMinutes?: number;
  description?: string;
  hidden?: boolean;
}
