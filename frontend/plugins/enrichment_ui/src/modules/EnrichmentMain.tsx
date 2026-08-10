import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

const IndexPage = lazy(() =>
  import('~/pages/providers/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

export const EnrichmentMain = () => {
  return (
    <Suspense fallback={<div />}>
      <Routes>
        <Route path="/" element={<IndexPage />} />
      </Routes>
    </Suspense>
  );
};
