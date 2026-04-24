import { servePublic } from '../_shared/serve-public.ts';
import { handleServeInstaller } from '../_shared/handlers/installer.ts';

servePublic(async (req, ctx) => {
  const url = new URL(req.url);
  const enrollmentKey = url.pathname.split('/').pop() || '';
  const payload: Record<string, string> = {
    enrollmentKey,
    mode: url.searchParams.get('mode') || 'args',
  };
  const hostname = url.searchParams.get('hostname');
  const osType = url.searchParams.get('os_type');
  if (hostname) payload.hostname = hostname;
  if (osType) payload.os_type = osType;

  // Use the shared handler directly to avoid bundling errors and extra network hops
  return await handleServeInstaller(ctx.supabase, req, ctx.requestId, payload);
});
