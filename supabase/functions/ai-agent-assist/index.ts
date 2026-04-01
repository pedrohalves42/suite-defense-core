/**
 * ai-agent-assist — Modularized
 * Modules: types, prompt-builder
 * Migrated to serveTenant middleware
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { AgentErrorContext, DiagnosisResult } from './types.ts';
import { SYSTEM_PROMPT, buildUserPrompt, buildFallbackDiagnosis } from './prompt-builder.ts';

const AgentAssistSchema = z.object({
  agent_id: z.string().min(1).max(255),
  agent_name: z.string().max(255).optional(),
  agent_version: z.string().max(64).optional(),
  error_type: z.string().min(1).max(255),
  error_message: z.string().min(1).max(5000),
  error_details: z.unknown().optional(),
  context: z.unknown().optional(),
});

serveTenant(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = AgentAssistSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validBody = parsed.data as AgentErrorContext;
  const userPrompt = buildUserPrompt(validBody);
  const { data: diagnosis, result } = await callAIJson<DiagnosisResult>(SYSTEM_PROMPT, userPrompt, { maxTokens: 2048, functionName: 'ai-agent-assist', tenantId: undefined });

  if (!diagnosis || !result.success) {
    logger.error('[ai-agent-assist] AI call failed', { requestId, error: result.error, provider: result.provider });
    return { requestId, diagnosis: buildFallbackDiagnosis(), provider: result.provider, latencyMs: result.latencyMs };
  }

  // Log evidence
  try {
    const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(diagnosis)));
    const evidenceHash = Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, '0')).join('');

    await supabase.from('agent_evidence_logs').insert({
      agent_id: validBody.agent_id, agent_name: validBody.agent_name, agent_version: validBody.agent_version,
      event_type: 'ai_self_heal_diagnosis',
      event_data: {
        error_type: validBody.error_type, diagnosis: diagnosis.diagnosis, root_cause: diagnosis.root_cause,
        confidence: diagnosis.confidence, actions_count: diagnosis.actions.length,
        requires_human_review: diagnosis.requires_human_review, provider: result.provider, latency_ms: result.latencyMs,
      },
      evidence_hash: evidenceHash,
      severity: diagnosis.actions.some(a => a.priority === 'critical') ? 'critical' : 'info',
      tenant_id: ctx.tenantId,
    });
  } catch (logErr) {
    logger.warn('[ai-agent-assist] Failed to log evidence', { error: (logErr as Error).message });
  }

  return { requestId, diagnosis, provider: result.provider, model: result.model, latencyMs: result.latencyMs };
});
