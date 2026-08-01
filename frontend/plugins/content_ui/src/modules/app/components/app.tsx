import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Spinner } from 'erxes-ui';

const ContentIndex = lazy(() =>
  import('~/pages/cms/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

const PluginContent = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center h-full">
          <Spinner size="sm" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<ContentIndex />} />
        <Route path="/knowledgebase" element={<ContentIndex />} />
      </Routes>
    </Suspense>
  );
};

export default PluginContent;
