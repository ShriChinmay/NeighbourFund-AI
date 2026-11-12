import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
const LegacyDashboard = lazy(() => import("../App"));
const Workspace = lazy(() => import("../pages/Workspace"));
const Projects = lazy(() => import("../pages/Projects"));
const NotFound = lazy(() => import("../pages/NotFound"));
const loading = <main aria-busy="true" aria-live="polite">Loading page...</main>;
export const router = createBrowserRouter([
 {path:"/",element:<Navigate to="/workspace" replace />},
 {path:"/workspace",element:<Suspense fallback={loading}><Workspace /></Suspense>},
 {path:"/projects",element:<Suspense fallback={loading}><Projects /></Suspense>},
 {path:"/legacy",element:<Suspense fallback={loading}><LegacyDashboard /></Suspense>},
 {path:"*",element:<Suspense fallback={loading}><NotFound /></Suspense>},
]);
