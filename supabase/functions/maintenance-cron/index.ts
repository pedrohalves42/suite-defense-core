import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"
import { RunMaintenanceUseCase } from "../_shared/hexagonal/use-cases/run-maintenance.ts"

/**
 * Thin Handler: maintenance-cron
 * Delegates all domain logic to RunMaintenanceUseCase.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const useCase = new RunMaintenanceUseCase(supabase);
    const result = await useCase.execute();

    return new Response(JSON.stringify({
      success: true,
      ...result,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = error as Error;
    console.error('[maintenance-cron] Fatal error:', err.message);

    try {
      await supabase.rpc('mark_cron_failure', {
        p_cron_name: 'maintenance-cron',
        p_error: err.message,
      });
    } catch (_) { /* best effort */ }

    return new Response(JSON.stringify({
      success: false,
      error: err.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
