import { servePublic } from '../_shared/serve-tenant.ts';
import { REINSTALL_PRESERVE_SCRIPT_CONTENT } from '../_shared/reinstall-preserve-script-content.ts';

/**
 * Get Reinstall Preserve Script - Edge Function
 * Serves the PowerShell reinstallation script that preserves agent credentials
 */

servePublic(async (req, ctx) => {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', message: 'Only GET requests are supported' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(REINSTALL_PRESERVE_SCRIPT_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Request-ID': ctx.requestId,
    },
  });
}, { methods: ['GET'] });
