import { lazy } from "react";
import { Routes, Route } from "react-router-dom";

const AuthDebug = lazy(() => import("@/pages/debug/AuthDebug"));

export default function DebugRoutes() {
  return (
    <Routes>
      <Route path="auth" element={<AuthDebug />} />
    </Routes>
  );
}
