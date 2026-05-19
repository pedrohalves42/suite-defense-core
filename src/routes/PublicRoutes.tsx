import { lazy } from "react";
import { Routes, Route } from "react-router-dom";

const Pricing = lazy(() => import("@/pages/Pricing"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const UpdatePassword = lazy(() => import("@/pages/UpdatePassword"));
const ForcePasswordChange = lazy(() => import("@/pages/ForcePasswordChange"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const CheckoutSuccess = lazy(() => import("@/pages/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("@/pages/CheckoutCancel"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacidade = lazy(() => import("@/pages/Privacidade"));
const Security = lazy(() => import("@/pages/Security"));
const VerificarLaudo = lazy(() => import("@/pages/VerificarLaudo"));
const ApprovePage = lazy(() => import("@/pages/ApprovePage"));
const TestComplianceGenerator = lazy(() => import("@/pages/TestComplianceGenerator"));
const NoTenant = lazy(() => import("@/pages/NoTenant"));
const Tutorials = lazy(() => import("@/pages/Tutorials"));
const Forbidden = lazy(() => import("@/pages/Forbidden"));
const NotFound = lazy(() => import("@/pages/NotFound"));

export default function PublicRoutes() {
  return (
    <Routes>
      <Route path="pricing" element={<Pricing />} />
      <Route path="login" element={<Login />} />
      <Route path="signup" element={<Signup />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="update-password" element={<UpdatePassword />} />
      <Route path="force-password-change" element={<ForcePasswordChange />} />
      <Route path="no-tenant" element={<NoTenant />} />
      <Route path="accept-invite" element={<AcceptInvite />} />
      <Route path="checkout/success" element={<CheckoutSuccess />} />
      <Route path="checkout/cancel" element={<CheckoutCancel />} />
      <Route path="terms" element={<Terms />} />
      <Route path="privacy" element={<Privacidade />} />
      <Route path="privacidade" element={<Privacidade />} />
      <Route path="security" element={<Security />} />
      <Route path="verificar/:laudoId" element={<VerificarLaudo />} />
      <Route path="verificar-laudo" element={<VerificarLaudo />} />
      <Route path="approve" element={<ApprovePage />} />
      <Route path="test-compliance" element={<TestComplianceGenerator />} />
      <Route path="tutorials" element={<Tutorials />} />
      <Route path="403" element={<Forbidden />} />
      <Route path="404" element={<NotFound />} />
    </Routes>
  );
}
