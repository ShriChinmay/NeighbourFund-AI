import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";

// Keep the existing dashboard available until its routes are migrated.
const LegacyDashboard = lazy(() => import("../App"));

export const router = createBrowserRouter([
  {
    path: "/*",
    element: (
      <Suspense
        fallback={
          <main aria-busy="true" aria-live="polite">
            Loading dashboard...
          </main>
        }
      >
        <LegacyDashboard />
      </Suspense>
    ),
  },
]);
