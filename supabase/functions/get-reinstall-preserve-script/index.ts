import { corsHeaders } from '../_shared/cors.ts';
import { REINSTALL_PRESERVE_SCRIPT_CONTENT } from '../_shared/reinstall-preserve-script-content.ts';

/**
 * Get Reinstall Preserve Script - Edge Function
 * Serves the PowerShell reinstallation script that preserves agent credentials
 * 
 * Usage:
 *   GET /functions/v1/get-reinstall-preserve-script
 *   
 * One-liner para máquinas Windows:
 *   irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
 *   
 * Returns:
 *   PowerShell script for reinstalling CyberShield agent preserving credentials
 */

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate HTTP method
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        message: 'Only GET requests are supported',
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    const requestId = crypto.randomUUID();
    console.log(`[get-reinstall-preserve-script] Serving script | requestId=${requestId}`);

    // Return the embedded script as a downloadable PowerShell file
    return new Response(REINSTALL_PRESERVE_SCRIPT_CONTENT, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="reinstall-agent-preserve.ps1"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Request-ID': requestId,
      },
    });
  } catch (error) {
    console.error('[get-reinstall-preserve-script] Error:', error);
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
