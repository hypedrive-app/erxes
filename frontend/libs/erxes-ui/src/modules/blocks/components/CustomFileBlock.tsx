import {
  DefaultInlineContentSchema,
  DefaultStyleSchema,
  fileBlockConfig,
} from '@blocknote/core';
import {
  FileBlockWrapper,
  ReactCustomBlockRenderProps,
  createReactBlockSpec,
  useUploadLoading,
} from '@blocknote/react';
import { IconFile } from '@tabler/icons-react';
import { Spinner } from 'erxes-ui/components';
import { FC } from 'react';
import { readImage } from '../../../utils/core';

type FileRenderProps = ReactCustomBlockRenderProps<
  typeof fileBlockConfig,
  DefaultInlineContentSchema,
  DefaultStyleSchema
>;

// `FileBlockWrapper` declares its editor against the abstract `FileBlockConfig`,
// whose block schema is an index signature (`{ [k: string]: FileBlockConfig }`).
// A concretely keyed schema such as `{ file: typeof fileBlockConfig }` can never
// satisfy that structurally, so the editor has to be re-stated at this boundary.
type FileWrapperEditor = Parameters<typeof FileBlockWrapper>[0]['editor'];

const toWrapperEditor = (editor: FileRenderProps['editor']) =>
  editor as unknown as FileWrapperEditor;

const CustomFilePreview: FC<Pick<FileRenderProps, 'block'>> = ({ block }) => {
  const url = readImage(block.props.url, undefined, true);

  return (
    <div
      className="bn-file-name-with-icon"
      contentEditable={false}
      draggable={false}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bn-file-icon">
          <IconFile size={24} />
        </div>
        <p className="bn-file-name">{block.props.name || block.props.url}</p>
      </a>
    </div>
  );
};

const CustomFileBlockContent: FC<FileRenderProps> = (props) => {
  const loading = useUploadLoading(props.block.id);

  if (loading) {
    return (
      <div className="bn-file-block-content-wrapper">
        <div className="bn-file-loading-preview flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Uploading...</span>
        </div>
      </div>
    );
  }

  return (
    <FileBlockWrapper
      block={props.block}
      editor={toWrapperEditor(props.editor)}
      buttonText={props.editor.dictionary.file_blocks.file.add_button_text}
      buttonIcon={<IconFile size={24} />}
    >
      <CustomFilePreview block={props.block} />
    </FileBlockWrapper>
  );
};

export const customFileBlock = createReactBlockSpec(fileBlockConfig, {
  render: CustomFileBlockContent,
});
