import { serveTenant } from '../_shared/serve-tenant.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const SYSTEM_PROMPT = `You are CyberShield Security Copilot ? an expert cybersecurity analyst assistant embedded in the CyberShield platform.

Your role:
- Analyze security alerts, vulnerabilities, and agent health data
- Suggest remediation steps for identified issues
- Answer questions about the organization's security posture
- Provide actionable recommendations based on real data
- Explain security concepts in clear, professional Portuguese (pt-BR)

Guidelines:
- Always base your analysis on the actual tenant data provided in context
- Be specific and actionable in recommendations
- Prioritize by severity: Critical > High > Medium > Low
- Reference specific agents, vulnerabilities, or alerts when applicable
- Use markdown formatting for clarity (headers, lists, bold)
- If you don't have enough data to answer, say so clearly
- Never fabricate data or metrics ? only use what's provided`;

async function getTenantContext(supabase: ReturnType<typeof createClient>, tenantId: string) {
  const [agents, alerts, vulns, insights] = await Promise.all([
    supabase.from('agents').select('id, hostname, status, os_type, agent_version, last_seen_at, health_score')
      .eq('tenant_id', tenantId).neq('status', 'archived').order('last_seen_at', { ascending: false }).limit(20),
    supabase.from('security_alerts').select('id, title, severity, status, alert_type, created_at')
      .eq('tenant_id', tenantId).in('status', ['open', 'in_progress']).order('created_at', { ascending: false }).limit(15),
    supabase.from('vulnerability_findings').select('id, cve_id, severity, title, status, affected_software')
      .eq('tenant_id', tenantId).in('status', ['open', 'in_progress']).order('severity').limit(15),
    supabase.from('ai_insights').select('id, title, severity, category, description, created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
  ]);

  const onlineCount = (agents.data || []).filter(a => a.status === 'online').length;
  const totalCount = (agents.data || []).length;
  const criticalAlerts = (alerts.data || []).filter(a => a.severity === 'critical').length;

  return `
## Contexto do Tenant (dados em tempo real)

### Agentes (${totalCount} total, ${onlineCount} online)
${(agents.data || []).slice(0, 10).map(a => `- ${a.hostname}: ${a.status} | OS: ${a.os_type} | v${a.agent_version} | Health: ${a.health_score ?? 'N/A'}`).join('\n')}

### Alertas Abertos (${(alerts.data || []).length} total, ${criticalAlerts} criticos)
${(alerts.data || []).slice(0, 10).map(a => `- [${a.severity?.toUpperCase()}] ${a.title} (${a.alert_type}) ? ${a.status}`).join('\n') || 'Nenhum alerta aberto'}

### Vulnerabilidades Abertas (${(vulns.data || []).length})
${(vulns.data || []).slice(0, 10).map(v => `- [${v.severity?.toUpperCase()}] ${v.cve_id || 'N/A'}: ${v.title} ? ${v.affected_software || 'N/A'}`).join('\n') || 'Nenhuma vulnerabilidade aberta'}

### Insights de IA Recentes
${(insights.data || []).slice(0, 5).map(i => `- [${i.severity}] ${i.title}: ${i.description?.substring(0, 100)}`).join('\n') || 'Nenhum insight recente'}
`;
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages } = body || {};
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const tenantContext = await getTenantContext(supabase, tenantId);

  const response = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + '\n\n' + tenantContext },
        ...messages,
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'Creditos de IA esgotados.' }), {
        status: 402, headers: { 'Content-Type': 'application/json' },
      });
    }
    const errText = await response.text();
    logger.error('AI gateway error:', response.status, errText);
    return new Response(JSON.stringify({ error: 'AI service error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Return streaming response directly
  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}, { methods: ['POST'] });
