import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  const agentName = body.agent_name;

  if (!agentName) {
    return new Response(
      JSON.stringify({ error: 'Missing agent_name in request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info('[diagnose-agent] Starting diagnosis', { 
    requestId, 
    agentName,
    userId,
    tenantId 
  });

  // Chamar funcao de diagnostico
  const { data: diagnosis, error: diagnosisError } = await supabase.rpc('diagnose_agent', {
    p_agent_name: agentName
  });

  if (diagnosisError) {
    logger.error('[diagnose-agent] Diagnosis failed', { 
      requestId, 
      agentName,
      error: diagnosisError.message 
    });
    throw diagnosisError;
  }

  logger.info('[diagnose-agent] Diagnosis complete', { 
    requestId, 
    agentName,
    isHealthy: diagnosis.is_healthy,
    issuesCount: diagnosis.issues?.length || 0
  });

  return diagnosis;
});
