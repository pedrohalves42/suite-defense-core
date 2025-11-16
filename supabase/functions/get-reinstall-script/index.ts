import { corsHeaders } from '../_shared/cors.ts';

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

  try {
    // Read the reinstall script from the public directory
    const scriptPath = './public/scripts/reinstall-cybershield-agent.ps1';
    
    let scriptContent: string;
    
    try {
      scriptContent = await Deno.readTextFile(scriptPath);
    } catch (readError) {
      console.error('Failed to read reinstall script:', readError);
      
      return new Response(
        JSON.stringify({
          error: 'Script not found',
          message: 'Reinstall script is not available',
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Return the script as a downloadable PowerShell file
    return new Response(scriptContent, {
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
