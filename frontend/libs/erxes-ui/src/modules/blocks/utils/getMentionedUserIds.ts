/**
 * The shape this reads off an editor block, kept deliberately loose.
 *
 * BlockNote types a block's `content` against the editor's own schema, so the
 * concrete type differs per editor and carries props that are optional and of
 * mixed types — a table or link block does not look like a paragraph. Naming
 * the full generic here would tie this helper to one schema and reject every
 * other caller's blocks, so it asks only for what it actually reads.
 */
type InlineContentLike = {
  type: string;
  props?: Record<string, unknown>;
};

type BlockLike = {
  content?: unknown;
};

/**
 * A mention carries the referenced user in `props._id`. Anything else in the
 * content stream is ignored, including nested content shapes (tables, links)
 * whose `content` is not an array of inline items.
 */
const isInlineContent = (value: unknown): value is InlineContentLike =>
  typeof value === 'object' && value !== null && 'type' in value;

export const getMentionedUserIds = (content: BlockLike[]) => {
  if (!content) return [];
  const mentionedUserIds: string[] = [];
  const flatContent = content.flatMap((block) =>
    Array.isArray(block.content) ? block.content : [],
  );
  flatContent.forEach((item) => {
    if (isInlineContent(item) && item.type === 'mention') {
      const id = item.props?._id;

      if (typeof id === 'string') {
        mentionedUserIds.push(id);
      }
    }
  });
  return mentionedUserIds;
};
