import { BlockEditor, cn, IBlockEditor, useBlockEditor } from 'erxes-ui';
import { useEffect } from 'react';
import { AttributeInEditor, DocumentInEditor } from 'ui-modules';

export const BroadcastEditor = ({
  onChange,
  attribute = false,
  document = false,
}: {
  /** Present so the editor can be spread a react-hook-form field; the editor
   * keeps its own document state and only reports changes back. */
  value?: string;
  onChange?: (value: string) => void;
  attribute?: boolean;
  document?: boolean;
}) => {
  const editor = useBlockEditor({});

  useEffect(() => {
    const unsubscribe = editor.onChange(async (editor: IBlockEditor) => {
      onChange?.(JSON.stringify(editor.document));
    });

    return unsubscribe;
  }, [editor, onChange]);

  return (
    <BlockEditor
      editor={editor}
      className={cn('flex-1 w-full overflow-y-auto')}
    >
      {attribute && (
        <AttributeInEditor
          editor={editor}
          contentType="core:contacts.customers"
        />
      )}
      {document && (
        <DocumentInEditor editor={editor} contentType="core:broadcast" />
      )}
    </BlockEditor>
  );
};
