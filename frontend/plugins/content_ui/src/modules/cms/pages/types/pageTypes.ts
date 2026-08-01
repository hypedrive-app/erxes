import { CustomFieldValue } from '../../posts/CustomFieldInput';

export interface IAttachment {
  url: string;
  name?: string;
  type?: string;
  size?: number;
  duration?: number;
}

export interface IPage {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
  clientPortalId?: string;
  thumbnail?: IAttachment | null;
  pageImages?: IAttachment[];
  video?: IAttachment | null;
  videoUrl?: string;
  audio?: IAttachment | null;
  documents?: IAttachment[];
  attachments?: IAttachment[];
  customFieldsData?: { field: string; value: CustomFieldValue }[];
  __typename?: string;
}

export interface IPageDrawerProps {
  page?: IPage;
  onClose: () => void;
  clientPortalId: string;
}

export interface IPageFormData {
  name: string;
  path: string;
  description?: string;
  parentId?: string;
  status: string;
  clientPortalId: string;
  // Edited through the shared MediaSection, which also reads/writes the legacy
  // bare-URL form alongside the object form.
  thumbnail?: string | { url: string; name?: string; type?: string } | null;
  gallery?: string[];
  videoUrl?: string;
  documents?: string[];
  attachments?: string[];
  customFieldsData?: { field: string; value: CustomFieldValue }[];
}

export interface IPagesRecordTableProps {
  clientPortalId: string;
  onEdit: (page: IPage) => void;
}
