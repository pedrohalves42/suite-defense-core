/**
 * ai-agent-assist — Modularized
 * Modules: types, prompt-builder
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { createErrorResponse, handleException, createValidationError, ErrorCode } from '../_shared/error-handler.ts';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import type { AgentErrorContext, DiagnosisResult } from './types.ts';
import { SYSTEM_PROMPT, buildUserPrompt, buildFallbackDiagnosis } from './prompt-builder.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const requestId = crypto.randomUUID();

  try {
    if (req.method !== 'POST') return createErrorResponse(ErrorCode.BAD_REQUEST, 'POST required', 405, requestId);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authorization required', 401, requestId);

    const body: AgentErrorContext = await req.json();
    if (!body.agent_id || !body.error_type || !body.error_message) {
      return createValidationError('Missing required fields: agent_id, error_type, error_message', undefined, requestId);
    }

    const userPrompt = buildUserPrompt(body);
    const { data: diagnosis, result } = await callAIJson<DiagnosisResult>(SYSTEM_PROMPT, userPrompt, { maxTokens: 2048, functionName: 'ai-agent-assist', tenantId: undefined });

    if (!diagnosis || !result.success) {
      logger.error('[ai-agent-assist] AI call failed', { requestId, error: result.error, provider: result.provider });
      return new Response(JSON.stringify({ requestId, diagnosis: buildFallbackDiagnosis(), provider: result.provider, latencyMs: result.latencyMs }), {
        status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Log evidence
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(diagnosis)));
      const evidenceHash = Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

      await supabase.from('agent_evidence_logs').insert({
        agent_id: body.agent_id, agent_name: body.agent_name, agent_version: body.agent_version,
        event_type: 'ai_self_heal_diagnosis',
        event_data: {
          error_type: body.error_type, diagnosis: diagnosis.diagnosis, root_cause: diagnosis.root_cause,
          confidence: diagnosis.confidence, actions_count: diagnosis.actions.length,
          requires_human_review: diagnosis.requires_human_review, provider: result.provider, latency_ms: result.latencyMs,
        },
        evidence_hash: evidenceHash,
        severity: diagnosis.actions.some(a => a.priority === 'critical') ? 'critical' : 'info',
        tenant_id: '',
      });
    } catch (logErr) {
      logger.warn('[ai-agent-assist] Failed to log evidence', { error: (logErr as Error).message });
    }

    return new Response(JSON.stringify({ requestId, diagnosis, provider: result.provider, model: result.model, latencyMs: result.latencyMs }), {
      status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return handleException(error, requestId, 'ai-agent-assist');
  }
});
