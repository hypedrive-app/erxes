import { Resizable } from 'erxes-ui';

export const ConversationDetailLayout = ({
  children,
  input,
}: {
  children: React.ReactNode;
  input: React.ReactNode;
}) => {
  return (
    <Resizable.PanelGroup direction="vertical">
      {/* Without a minSize, dragging the handle can collapse either pane to
          ~0 height with no way back short of a page reload — nothing here
          snaps back or refuses to go further. */}
      <Resizable.Panel defaultSize={input ? 70 : 100} minSize={20}>
        <div className="relative h-full overflow-hidden">{children}</div>
      </Resizable.Panel>
      {input && (
        <>
          <Resizable.Handle className="bg-transparent hover:bg-border" />
          <Resizable.Panel defaultSize={30} minSize={15}>
            {input}
          </Resizable.Panel>
        </>
      )}
    </Resizable.PanelGroup>
  );
};
