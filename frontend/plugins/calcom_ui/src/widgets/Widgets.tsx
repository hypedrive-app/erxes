export const Widgets = ({
  module,
  contentId,
  contentType,
}: {
  module: string;
  contentId: string;
  contentType: string;
}) => {
  return <div>bookings Widget for {contentType} ({contentId})</div>;
};
