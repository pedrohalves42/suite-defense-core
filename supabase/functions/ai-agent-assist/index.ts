/**
 * AI Agent Self-Healing Assistant
 * 
 * Receives error context + system snapshot from agents,
 * uses AI to diagnose and suggest remediation actions.
 * 
 * Architecture: Hexagonal ? uses callAIJson for multi-provider routing.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { createErrorResponse, handleException, createValidationError, ErrorCode } from '../_shared/error-handler.ts';
import { callAIJson } from '../_shared/ai-provider-helper.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

// ??? Types ??????????????????????????????????????????????

interface AgentErrorContext {
  agent_id: string;
  agent_name: string;
  agent_version: string;
  error_type: string;
  error_message: string;
  error_stack?: string;
  system_snapshot: {
    cpu_percent?: number;
    memory_percent?: number;
    disk_percent?: number;
    uptime_hours?: number;
    os_version?: string;
    network_status?: string;
    recent_events?: string[];
  };
  recent_errors?: Array<{
    timestamp: string;
    type: string;
    message: string;
  }>;
}

interface RemediationAction {
  action: 'restart_service' | 'clear_cache' | 'free_disk_space' | 'restart_agent' |
    'check_network' | 'update_agent' | 'escalate' | 'ignore' | 'adjust_config';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  auto_executable: boolean;
  parameters?: Record<string, unknown>;
  estimated_impact: string;
}

interface DiagnosisResult {
  diagnosis: string;
  root_cause: string;
  confidence: number;
  actions: RemediationAction[];
  requires_human_review: boolean;
  similar_past_incidents?: string;
}

// ??? System Prompt ??????????????????????????????????????

const SYSTEM_PROMPT = `You are an expert system administrator AI assistant for CyberShield monitoring agents.

Given an error context and system snapshot from a Windows monitoring agent, you must:
1. Diagnose the root cause of the error
2. Suggest concrete remediation actions the agent can auto-execute
3. Assess confidence level and whether human review is needed

RULES:
- Be specific: "Restart Windows Service 'CyberShieldAgent'" not "restart service"
- Prioritize non-destructive actions first
- If disk > 90%, suggest cleanup before other fixes
- If memory > 85%, suggest process restart
- If repeated network errors, suggest connectivity check then escalate
- NEVER suggest deleting user data or system files
- Mark actions as auto_executable=true ONLY if they are safe and reversible

Respond in JSON format:
{
  "diagnosis": "Clear 1-2 sentence diagnosis",
  "root_cause": "Specific root cause identified",
  "confidence": 0.0-1.0,
  "actions": [
    {
      "action": "restart_service|clear_cache|free_disk_space|restart_agent|check_network|update_agent|escalate|ignore|adjust_config",
      "priority": "critical|high|medium|low",
      "description": "What this action does",
      "auto_executable": true|false,
      "parameters": {},
      "estimated_impact": "Expected result"
    }
  ],
  "requires_human_review": true|false,
  "similar_past_incidents": "Brief note if pattern matches common issues"
}`;

// ??? Handler ????????????????????????????????????????????

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }


  // Auth guard: require authenticated user or internal caller
  const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;
  const requestId = crypto.randomUUID();

  try {
    if (req.method !== 'POST') {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'POST required', 405, requestId);
    }

    // Auth: validate agent token or service role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authorization required', 401, requestId);
    }

    const body: AgentErrorContext = await req.json();

    // Validate required fields
    if (!body.agent_id || !body.error_type || !body.error_message) {
      return createValidationError('Missing required fields: agent_id, error_type, error_message', undefined, requestId);
    }

    // Build user prompt with context
    const userPrompt = `
AGENT ERROR REPORT:
- Agent: ${body.agent_name} (v${body.agent_version})
- Error Type: ${body.error_type}
- Error Message: ${body.error_message}
${body.error_stack ? `- Stack: ${body.error_stack.substring(0, 500)}` : ''}

SYSTEM SNAPSHOT:
- CPU: ${body.system_snapshot.cpu_percent ?? 'N/A'}%
- Memory: ${body.system_snapshot.memory_percent ?? 'N/A'}%
- Disk: ${body.system_snapshot.disk_percent ?? 'N/A'}%
- Uptime: ${body.system_snapshot.uptime_hours ?? 'N/A'} hours
- OS: ${body.system_snapshot.os_version ?? 'N/A'}
- Network: ${body.system_snapshot.network_status ?? 'N/A'}

${body.recent_errors?.length ? `RECENT ERRORS (last 5):\n${body.recent_errors.slice(0, 5).map(e => `  [${e.timestamp}] ${e.type}: ${e.message}`).join('\n')}` : 'No recent error history'}

${body.system_snapshot.recent_events?.length ? `RECENT EVENTS:\n${body.system_snapshot.recent_events.slice(0, 10).join('\n')}` : ''}

Analyze and provide diagnosis with remediation actions.`;

    // Call AI via multi-provider system
    const { data: diagnosis, result } = await callAIJson<DiagnosisResult>(
      SYSTEM_PROMPT,
      userPrompt,
      {
        maxTokens: 2048,
        functionName: 'ai-agent-assist',
        tenantId: undefined,
      },
    );

    if (!diagnosis || !result.success) {
      logger.error('[ai-agent-assist] AI call failed', {
        requestId,
        error: result.error,
        provider: result.provider,
      });

      // Return safe fallback diagnosis
      return new Response(
        JSON.stringify({
          requestId,
          diagnosis: {
            diagnosis: 'Unable to perform AI diagnosis at this time',
            root_cause: 'AI service temporarily unavailable',
            confidence: 0,
            actions: [{
              action: 'escalate',
              priority: 'medium',
              description: 'Escalate to administrator for manual review',
              auto_executable: false,
              estimated_impact: 'Issue will be reviewed by human operator',
            }],
            requires_human_review: true,
          },
          provider: result.provider,
          latencyMs: result.latencyMs,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Log the assist event for observability
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      await supabase.from('agent_evidence_logs').insert({
        agent_id: body.agent_id,
        agent_name: body.agent_name,
        agent_version: body.agent_version,
        event_type: 'ai_self_heal_diagnosis',
        event_data: {
          error_type: body.error_type,
          diagnosis: diagnosis.diagnosis,
          root_cause: diagnosis.root_cause,
          confidence: diagnosis.confidence,
          actions_count: diagnosis.actions.length,
          requires_human_review: diagnosis.requires_human_review,
          provider: result.provider,
          latency_ms: result.latencyMs,
        },
        evidence_hash: await generateHash(JSON.stringify(diagnosis)),
        severity: diagnosis.actions.some(a => a.priority === 'critical') ? 'critical' : 'info',
        tenant_id: '', // Will be resolved by agent_id lookup if needed
      });
    } catch (logErr) {
      logger.warn('[ai-agent-assist] Failed to log evidence', {
        error: (logErr as Error).message,
      });
    }

    return new Response(
      JSON.stringify({
        requestId,
        diagnosis,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return handleException(error, requestId, 'ai-agent-assist');
  }
});

// ??? Helper ?????????????????????????????????????????????
async function generateHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
