// @ts-nocheck
import { servePublic } from '../_shared/serve-public.ts';
import { handleGetDiagnosticScript } from '../_shared/handlers/diagnostic-script.ts';

servePublic(async (req, ctx) => {
  // Use the shared handler directly to avoid bundling errors and extra network hops
  return await handleGetDiagnosticScript(ctx.supabase, req, ctx.requestId, {});
});