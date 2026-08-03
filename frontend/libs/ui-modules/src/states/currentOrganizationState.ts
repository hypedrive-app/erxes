import { atom } from 'jotai';

export type CurrentOrganization = {
  name: string;
  hasOwner?: boolean;
  logo?: string;
  theme?: {
    logo?: string;
    favicon?: string;
  };
  plugins?: {
    name: string;
    url: string;
  }[];
  type?: string;
  orgLogo?: string;
  orgLoginText?: string;
  orgLoginDescription?: string;
  orgFavicon?: string;
  orgShortDescription?: string;
  orgShortName?: string;
  /**
   * Accent colour as hex, from white-label settings. Applied by core-ui when
   * /initial-setup resolves; overrides the deployment's REACT_APP_ACCENT_COLOR.
   */
  orgAccentColor?: string;
  orgCustomOnboarding?: boolean;
  bundle?: {
    type?: string;
  };
};

export const currentOrganizationState = atom<CurrentOrganization | null>(null);
