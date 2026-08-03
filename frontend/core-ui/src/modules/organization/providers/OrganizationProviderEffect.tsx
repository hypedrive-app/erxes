import { useEffect } from 'react';

import {
  clientConfigApiStatusState,
  CurrentOrganization,
  currentOrganizationState,
  isCurrentOrganizationLoadedState,
} from 'ui-modules';

import { REACT_APP_API_URL } from 'erxes-ui';
import { useAtom, useSetAtom } from 'jotai';

import { applyOrgAccent } from '~/theme/applyRuntimeTheme';

export const OrganizationProviderEffect = () => {
  const [isCurrentOrganizationLoaded, setIsCurrentOrganizationLoaded] = useAtom(
    isCurrentOrganizationLoadedState,
  );

  const setCurrentOrganization = useSetAtom(currentOrganizationState);
  const setApiStatus = useSetAtom(clientConfigApiStatusState);

  useEffect(() => {
    if (isCurrentOrganizationLoaded) {
      return;
    }

    fetch(REACT_APP_API_URL + '/initial-setup')
      .then((res) => res.json())
      .then((data: CurrentOrganization) => {
        if (data.hasOwner == false) {
          setIsCurrentOrganizationLoaded(true);
          setCurrentOrganization(data);
          return;
        }

        // Applied here rather than in a component: the accent must land as
        // soon as the config arrives, and every consumer of this state renders
        // below it. bootstrap.tsx has already applied the deployment default,
        // so this only repaints when the two actually differ.
        applyOrgAccent(data.orgAccentColor);

        setCurrentOrganization(data);
        setIsCurrentOrganizationLoaded(true);
        setApiStatus({
          isErrored: false,
          isLoaded: true,
        });
      })
      .catch((e: Error) => {
        setCurrentOrganization(null);
        setIsCurrentOrganizationLoaded(false);
        setApiStatus({
          isErrored: true,
          isLoaded: true,
          error: e,
        });
      });
  }, [
    isCurrentOrganizationLoaded,
    setIsCurrentOrganizationLoaded,
    setCurrentOrganization,
  ]);

  return null;
};
