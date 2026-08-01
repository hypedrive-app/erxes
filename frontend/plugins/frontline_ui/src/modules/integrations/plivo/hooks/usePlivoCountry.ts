import { CountryCode } from 'libphonenumber-js';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { plivoDefaultCountryCodeAtom } from '@/integrations/plivo/states/plivoStates';
import { resolvePlivoCountry } from '@/integrations/plivo/utils/plivoPhone';

/**
 * The country every Plivo surface parses and formats numbers against.
 *
 * Read from the selected integration's own `defaultCountryCode` rather than
 * from a module constant. The constant this replaced was `'MN'` — copied from
 * the upstream `call` module, which hardcodes Mongolia throughout — so on an
 * Indian deployment every number typed without `+91` was parsed against the
 * wrong numbering plan and rejected as invalid. Which country a tenant dials
 * from is a property of the tenant, not of the code.
 *
 * Returns `undefined` when no dialing code is configured, which makes the
 * parser require a full international number instead of silently attributing a
 * national one to an arbitrary country.
 */
export const usePlivoCountry = (): CountryCode | undefined => {
  const defaultCountryCode = useAtomValue(plivoDefaultCountryCodeAtom);

  return useMemo(
    () => resolvePlivoCountry(defaultCountryCode),
    [defaultCountryCode],
  );
};
