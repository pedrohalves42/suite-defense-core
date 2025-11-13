import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GITHUB_TOKEN = Deno.env.get('BUILD_GH_TOKEN')!;
const GITHUB_REPO = Deno.env.get('BUILD_GH_REPOSITORY')!; // formato: "owner/repo"

interface StuckBuild {
  id: string;
  github_run_id: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  logger.info('[build-watchdog] Starting watchdog check');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    return await withTimeout(async () => {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Buscar builds em "building" há mais de 10 minutos
      const { data: stuckBuilds, error: queryError } = await supabase
        .from('agent_builds')
        .select('id, github_run_id, created_at')
        .eq('build_status', 'building')
        .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .returns<StuckBuild[]>();

      if (queryError) throw queryError;

      if (!stuckBuilds || stuckBuilds.length === 0) {
        logger.info('[build-watchdog] No stuck builds found');
        return new Response(
          JSON.stringify({ 
            success: true, 
            checked_builds: 0,
            message: 'No stuck builds detected',
            requestId,
            timestamp: new Date().toISOString()
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      logger.info(`[build-watchdog] Found ${stuckBuilds.length} potentially stuck builds`);

      const results = [];
      
      for (const build of stuckBuilds) {
        let shouldFail = false;
        let reason = 'Unknown';

        // Se não tem github_run_id, falhar imediatamente
        if (!build.github_run_id) {
          shouldFail = true;
          reason = 'No GitHub run ID - likely failed before workflow started';
        } else {
          // Verificar status no GitHub
          try {
            const ghResponse = await fetch(
              `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${build.github_run_id}`,
              {
                headers: {
                  'Authorization': `Bearer ${GITHUB_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json',
                },
              }
            );

            if (ghResponse.ok) {
              const ghData = await ghResponse.json();
              const status = ghData.status; // "queued" | "in_progress" | "completed"
              const conclusion = ghData.conclusion; // "success" | "failure" | "cancelled" | null

              if (status === 'completed' && conclusion !== 'success') {
                shouldFail = true;
                reason = `GitHub workflow ${conclusion}`;
              } else if (status === 'completed' && conclusion === 'success') {
                shouldFail = true;
                reason = 'GitHub workflow succeeded but callback never received';
              }
            } else if (ghResponse.status === 404) {
              shouldFail = true;
              reason = 'GitHub workflow not found (deleted or never existed)';
            }
          } catch (ghError) {
            logger.error(`[build-watchdog] GitHub API error for build ${build.id}`, ghError);
            // Não falhar o build se GitHub API estiver down
          }
        }

        if (shouldFail) {
          const { error: updateError } = await supabase
            .from('agent_builds')
            .update({
              build_status: 'failed',
              build_completed_at: new Date().toISOString(),
              error_message: `Build watchdog: ${reason}`
            })
            .eq('id', build.id);

          results.push({
            build_id: build.id,
            action: 'marked_failed',
            reason,
            error: updateError?.message || null
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          checked_builds: stuckBuilds.length,
          marked_failed: results.length,
          results,
          requestId,
          timestamp: new Date().toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }, { timeoutMs: 25000 });

  } catch (error) {
    if (error instanceof Error && error.message === 'Request timeout') {
      return createTimeoutResponse(corsHeaders);
    }
    
    logger.error('[build-watchdog] Error', error);
    return new Response(
      JSON.stringify({
        error: 'Watchdog failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
