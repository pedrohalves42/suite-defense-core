import type { AgentErrorContext } from './types.ts';

export const SYSTEM_PROMPT = `You are an expert system administrator AI assistant for CyberShield monitoring agents.

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

export function buildUserPrompt(body: AgentErrorContext): string {
  return `
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
}

export function buildFallbackDiagnosis() {
  return {
    diagnosis: 'Unable to perform AI diagnosis at this time',
    root_cause: 'AI service temporarily unavailable',
    confidence: 0,
    actions: [{
      action: 'escalate' as const,
      priority: 'medium' as const,
      description: 'Escalate to administrator for manual review',
      auto_executable: false,
      estimated_impact: 'Issue will be reviewed by human operator',
    }],
    requires_human_review: true,
  };
}
