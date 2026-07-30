import {
  IWhatsappTemplate,
  IWhatsappTemplateComponent,
  IWhatsappTemplateDispatch,
  IWhatsappTemplateSendComponent,
} from '../types/WhatsappTemplate';

/** Matches the positional placeholders Meta approves, e.g. `{{1}}`. */
const PLACEHOLDER_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

export const findTemplateComponent = (
  template: IWhatsappTemplate | undefined,
  type: IWhatsappTemplateComponent['type'],
): IWhatsappTemplateComponent | undefined =>
  template?.components?.find((component) => component.type === type);

/**
 * The distinct `{{n}}` indexes in a piece of approved copy, ascending.
 *
 * Returns the indexes rather than a count because a template may repeat a
 * placeholder (`{{1}} ... {{1}}`) or, rarely, skip one; the number of VALUES
 * Meta expects is the number of distinct indexes, and sending a different
 * count is rejected outright (the 132000 error family).
 */
export const getTemplatePlaceholders = (text?: string): number[] => {
  if (!text) {
    return [];
  }

  const indexes = new Set<number>();

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    indexes.add(Number(match[1]));
  }

  return [...indexes].sort((a, b) => a - b);
};

/**
 * Only a TEXT header can take parameters we collect as plain fields; a media
 * header needs an uploaded asset, which the composer does not gather, so those
 * templates are offered without header variables.
 */
export const getHeaderPlaceholders = (
  template: IWhatsappTemplate | undefined,
): number[] => {
  const header = findTemplateComponent(template, 'HEADER');

  if (!header || (header.format && header.format !== 'TEXT')) {
    return [];
  }

  return getTemplatePlaceholders(header.text);
};

export const getBodyPlaceholders = (
  template: IWhatsappTemplate | undefined,
): number[] =>
  getTemplatePlaceholders(findTemplateComponent(template, 'BODY')?.text);

/** Substitutes collected values into approved copy for the preview. */
export const renderTemplateText = (
  text: string | undefined,
  placeholders: number[],
  values: string[],
): string => {
  if (!text) {
    return '';
  }

  return text.replace(PLACEHOLDER_PATTERN, (match, rawIndex) => {
    const position = placeholders.indexOf(Number(rawIndex));
    const value = position === -1 ? '' : values[position];

    return value?.trim() ? value : match;
  });
};

/**
 * The full resolved message, used both for the preview and as the `content`
 * stored on the thread so the bubble shows what the customer received.
 */
export const buildTemplatePreview = (
  template: IWhatsappTemplate,
  headerValues: string[],
  bodyValues: string[],
): string => {
  const header = findTemplateComponent(template, 'HEADER');
  const body = findTemplateComponent(template, 'BODY');
  const footer = findTemplateComponent(template, 'FOOTER');

  const headerText =
    header && (!header.format || header.format === 'TEXT')
      ? renderTemplateText(
          header.text,
          getHeaderPlaceholders(template),
          headerValues,
        )
      : '';

  const bodyText = renderTemplateText(
    body?.text,
    getBodyPlaceholders(template),
    bodyValues,
  );

  return [headerText, bodyText, footer?.text]
    .filter((part) => !!part?.trim())
    .join('\n\n');
};

/**
 * Builds the `template` payload sent on `extraInfo.whatsappTemplate`.
 *
 * Components are emitted in the order Meta documents (header then body) and
 * each `parameters[]` follows the ascending placeholder order, because
 * positional `{{n}}` are resolved by ARRAY ORDER, not by index number.
 * A component with no parameters is omitted entirely.
 */
export const buildTemplateDispatch = (
  template: IWhatsappTemplate,
  headerValues: string[],
  bodyValues: string[],
): IWhatsappTemplateDispatch => {
  const components: IWhatsappTemplateSendComponent[] = [];

  const headerPlaceholders = getHeaderPlaceholders(template);
  const bodyPlaceholders = getBodyPlaceholders(template);

  if (headerPlaceholders.length) {
    components.push({
      type: 'header',
      parameters: headerPlaceholders.map((_placeholder, index) => ({
        type: 'text',
        text: headerValues[index] ?? '',
      })),
    });
  }

  if (bodyPlaceholders.length) {
    components.push({
      type: 'body',
      parameters: bodyPlaceholders.map((_placeholder, index) => ({
        type: 'text',
        text: bodyValues[index] ?? '',
      })),
    });
  }

  return {
    name: template.name,
    languageCode: template.language,
    ...(components.length ? { components } : {}),
  };
};
