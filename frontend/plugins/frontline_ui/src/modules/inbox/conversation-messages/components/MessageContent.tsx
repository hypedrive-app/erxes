import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, BlockEditorReadOnly } from 'erxes-ui';
import { IconX } from '@tabler/icons-react';

export const MessageContent = ({
  content,
  internal,
}: {
  content?: string;
  internal?: boolean;
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!messageRef.current) return;

    const images = messageRef.current.getElementsByTagName('img');

    Array.from(images).forEach((img) => {
      img.style.cursor = 'pointer';
      img.onclick = () => setSelectedImage(img.src);
    });
  }, [content]);

  return (
    <>
      {!!content && (
        <BlockEditorReadOnly
          content={content}
          className="read-only"
          ref={messageRef}
        />
      )}
      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <Dialog.Content className="relative max-w-[90vw] p-0 border-none overflow-hidden">
          {/* A full-bleed image dialog has no header bar to carry the usual
              close button, so Esc / backdrop click were the only way out —
              undiscoverable for a sighted user who has not learned that. */}
          <Dialog.Close asChild>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full opacity-90 hover:opacity-100"
            >
              <IconX />
            </Button>
          </Dialog.Close>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Full size"
              className="w-full h-auto object-contain"
            />
          )}
        </Dialog.Content>
      </Dialog>
    </>
  );
};
