import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
const LegacyDashboard = lazy(() => import("../App"));
const Workspace = lazy(() => import("../pages/Workspace"));
const Projects = lazy(() => import("../pages/Projects"));
const Funding = lazy(() => import("../pages/Funding"));
const PublicProject = lazy(() => import("../pages/PublicProject"));
const Contribute = lazy(() => import("../pages/Contribute"));
const Sponsor = lazy(() => import("../pages/Sponsor"));
const NotFound = lazy(() => import("../pages/NotFound"));
const loading = <main aria-busy="true" aria-live="polite">Loading page...</main>;
export const router = createBrowserRouter([
 {path:"/",element:<Navigate to="/workspace" replace />},
 {path:"/workspace",element:<Suspense fallback={loading}><Workspace /></Suspense>},
 {path:"/projects",element:<Suspense fallback={loading}><Projects /></Suspense>},
 {path:"/funding",element:<Suspense fallback={loading}><Funding /></Suspense>},
 {path:"/contribute/:id",element:<Suspense fallback={loading}><Contribute /></Suspense>},
 {path:"/sponsor/:id",element:<Suspense fallback={loading}><Sponsor /></Suspense>},
 {path:"/p/:id",element:<Suspense fallback={loading}><PublicProject /></Suspense>},
 {path:"/legacy",element:<Suspense fallback={loading}><LegacyDashboard /></Suspense>},
 {path:"*",element:<Suspense fallback={loading}><NotFound /></Suspense>},
]);
