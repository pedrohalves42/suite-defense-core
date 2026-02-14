import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import {
  SupabaseVersionQueryAdapter,
  SupabaseUpdateJobAdapter,
  SupabaseObservabilityAdapter,
  LoggingEventDispatcherAdapter,
  ProcessAgentUpdatesUseCase,
} from '../_shared/hexagonal/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * FASE 4: Edge Function para push de updates automatico
 * 
 * Refatorada com Arquitetura Hexagonal:
 * - Use Case: ProcessAgentUpdatesUseCase (orquestra lógica de negócio)
 * - Adapters: Supabase implementations dos output ports
 * - Edge Function: Thin HTTP handler (Presentation Layer)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[process-agent-updates] Cron job started', { requestId });

    // ─── Compose hexagonal dependencies ───────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const useCase = new ProcessAgentUpdatesUseCase(
      new SupabaseVersionQueryAdapter(supabase),
      new SupabaseUpdateJobAdapter(supabase),
      new SupabaseObservabilityAdapter(supabase),
      new LoggingEventDispatcherAdapter(),
    );

    // ─── Execute use case ─────────────────────────────
    const result = await useCase.execute(requestId);

    if (result.platforms.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No latest versions registered' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Report cron health on success
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'process-agent-updates',
        p_success: true,
        p_details: {
          total_jobs_created: result.totalJobsCreated,
          platforms_processed: result.platforms.length,
        },
      });
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({
        success: result.success,
        total_jobs_created: result.totalJobsCreated,
        platforms: result.platforms.map((p) => ({
          platform: p.platform,
          outdated_count: p.outdatedCount,
          jobs_created: p.jobsCreated,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[process-agent-updates] Internal error', {
      requestId,
      error: err.message,
      stack: err.stack,
    });

    // Report cron health on failure (best-effort)
    try {
      const supabaseFallback = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabaseFallback.rpc('update_cron_health', {
        p_cron_name: 'process-agent-updates',
        p_success: false,
        p_details: { error: err.message },
      });
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: err.message,
        requestId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
