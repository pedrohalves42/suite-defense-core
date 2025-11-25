import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { requireSuperAdmin } from '../_shared/require-super-admin.ts';
import { logger } from '../_shared/logger.ts';
import { AGENT_SCRIPT_WINDOWS_CONTENT } from '../_shared/agent-script-windows-content.ts';

const requestId = crypto.randomUUID();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate as super_admin
    const authResult = await requireSuperAdmin(req, requestId);
    if (!authResult.success) {
      return authResult.response!;
    }

    logger.info(`[${requestId}] Super admin ${authResult.userId} requesting agent script content`);

    // Return the embedded agent script content directly
    return new Response(
      JSON.stringify({
        success: true,
        script_content: AGENT_SCRIPT_WINDOWS_CONTENT,
        size_bytes: AGENT_SCRIPT_WINDOWS_CONTENT.length,
        source: 'embedded',
        requestId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error(`[${requestId}] Error in get-agent-script-content:`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
