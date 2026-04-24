import { servePublic } from '../_shared/serve-public.ts';
import { handleGetLatestAgentScript } from '../public-gateway/handlers/latest-agent-script.ts';

servePublic(async (req, ctx) => {
  const url = new URL(req.url);
  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }
  
  // Use the handler directly instead of proxying via fetch
  return await handleGetLatestAgentScript(ctx.supabase, req, ctx.requestId, payload);
});
