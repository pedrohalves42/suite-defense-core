import { corsHeaders } from '../_shared/cors.ts';
import { REINSTALL_SCRIPT_CONTENT } from '../_shared/reinstall-script-content.ts';

/**
 * Get Reinstall Script - Edge Function
 * Serves the PowerShell reinstallation script for Windows agents
 * 
 * Usage:
 *   GET /functions/v1/get-reinstall-script
 *   
 * Returns:
 *   PowerShell script for reinstalling CyberShield agent
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
    console.log('Serving reinstall script from embedded content');

    // Return the embedded script as a downloadable PowerShell file
    return new Response(REINSTALL_SCRIPT_CONTENT, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="reinstall-cybershield-agent.ps1"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Error serving reinstall script:', error);
    
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
