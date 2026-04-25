// @ts-nocheck
import { servePublic } from '../_shared/serve-public.ts';
import { handleGetLatestAgentScript } from '../_shared/handlers/latest-agent-script.ts';

servePublic(async (req, ctx) => {
  const url = new URL(req.url);
  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }
  
  // Use the shared handler directly to avoid bundling errors and extra network hops
  return await handleGetLatestAgentScript(ctx.supabase, req, ctx.requestId, payload);
});