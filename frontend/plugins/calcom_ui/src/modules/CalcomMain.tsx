import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

const BookingsIndexPage = lazy(() =>
  import('~/pages/bookings/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

const EventTypesIndexPage = lazy(() =>
  import('~/pages/eventTypes/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

const SchedulesIndexPage = lazy(() =>
  import('~/pages/schedules/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

const TeamsIndexPage = lazy(() =>
  import('~/pages/teams/IndexPage').then((module) => ({
    default: module.IndexPage,
  })),
);

const TeamsDetailPage = lazy(() =>
  import('~/pages/teams/DetailPage').then((module) => ({
    default: module.DetailPage,
  })),
);

export const CalcomMain = () => {
  return (
    <Suspense fallback={<div />}>
      <Routes>
        <Route path="/" element={<BookingsIndexPage />} />
        <Route path="/bookings" element={<BookingsIndexPage />} />
        <Route path="/event-types" element={<EventTypesIndexPage />} />
        <Route path="/schedules" element={<SchedulesIndexPage />} />
        <Route path="/teams" element={<TeamsIndexPage />} />
        <Route path="/teams/:teamId" element={<TeamsDetailPage />} />
      </Routes>
    </Suspense>
  );
};
