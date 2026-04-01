import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const DiagnoseAgentSchema = z.object({
  agent_name: z.string().min(1).max(255),
});

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  const parsed = DiagnoseAgentSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { agent_name: agentName } = parsed.data;

  logger.info('[diagnose-agent] Starting diagnosis', { 
    requestId, 
    agentName,
    userId,
    tenantId 
  });

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
