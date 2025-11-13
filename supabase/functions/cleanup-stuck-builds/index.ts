import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  logger.info('[cleanup-stuck-builds] Function started');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment variables
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      logger.error('Missing environment variables');
      return new Response(
        JSON.stringify({
          error: 'Server configuration error',
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create Supabase client with service role
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    logger.info('[cleanup-stuck-builds] Executing cleanup function');

    // Execute the cleanup function
    const { data, error } = await supabaseClient.rpc('cleanup_stuck_builds');

    if (error) {
      logger.error('[cleanup-stuck-builds] Cleanup function failed', error);
      return new Response(
        JSON.stringify({
          error: 'Cleanup failed',
          message: error.message,
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : { cleaned_count: 0, build_ids: [] };
    
    logger.info(`[cleanup-stuck-builds] Cleanup completed: ${result.cleaned_count} builds cleaned`);

    return new Response(
      JSON.stringify({
        success: true,
        cleaned_count: result.cleaned_count,
        build_ids: result.build_ids || [],
        message: `Successfully cleaned ${result.cleaned_count} stuck build(s)`,
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    logger.error('[cleanup-stuck-builds] Unexpected error', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
