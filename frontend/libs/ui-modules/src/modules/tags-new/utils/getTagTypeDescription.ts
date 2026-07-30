/**
 * Splits on non-alphanumeric separators and camelCase boundaries, then
 * capitalises each word. Matches `lodash.startCase` for the plugin/module
 * identifiers used as tag content types (e.g. `core:form_submission`,
 * `sales:posOrder`). Inlined because `@types/lodash` is a backend-only
 * dependency and is not resolvable from the frontend tsconfigs.
 */
const startCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const getTagTypeDescription = ({type, tagTypes}: {type: string | null, tagTypes: Record<string, {description: string; contentType: string}[]>}) => {
  let result = "";
  const tagTypesEntries = Object.entries(tagTypes);
  if (!type) {
    return "Workspace";
  }
if (!type?.startsWith("core")) {
  result += type.split(":")[0] + " ";
}
result += type.split(":")[1];
return startCase(result);
}