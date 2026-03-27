import { servePublic } from '../_shared/serve-tenant.ts';
import { REINSTALL_SCRIPT_CONTENT } from '../_shared/reinstall-script-content.ts';

/**
 * Get Reinstall Script - Edge Function
 * Serves the PowerShell reinstallation script for Windows agents
 */

servePublic(async (req, _ctx) => {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', message: 'Only GET requests are supported' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(REINSTALL_SCRIPT_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="reinstall-cybershield-agent.ps1"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}, { methods: ['GET'] });
