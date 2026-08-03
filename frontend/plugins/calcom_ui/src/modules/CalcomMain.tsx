import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

const IndexPage = lazy(() =>
  import('~/pages/bookings/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

export const CalcomMain = () => {
  return (
    <Suspense fallback={<div />}>
      <Routes>
        <Route path="/" element={<IndexPage />} />
      </Routes>
    </Suspense>
  );
};
