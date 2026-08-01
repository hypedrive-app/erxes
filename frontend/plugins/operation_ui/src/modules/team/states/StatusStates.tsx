import { atom } from 'jotai';
import { TeamStatusTypes } from '@/team/constants';

type TeamStatusType = (typeof TeamStatusTypes)[keyof typeof TeamStatusTypes];

export const addingStatusState = atom<TeamStatusType | null>(null);

export const editingStatusState = atom<string | null>(null);
