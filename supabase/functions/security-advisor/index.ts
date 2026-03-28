/**
 * security-advisor Edge Function
 * 
 * Analyzes the tenant's current security posture and generates
 * contextual, actionable recommendations using Lovable AI.
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface SecurityGap {
  area: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  currentValue: number | string;
  targetValue: number | string;
}

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  logger.info(`[security-advisor][${requestId}] Analyzing security posture for tenant ${tenantId}`);

  // ??? Gather current state ??????????????????????????

  // 1. Agents
  const { count: totalAgents } = await supabase
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("archived","deleted")');

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { count: onlineAgents } = await supabase
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("archived","deleted")')
    .gte('last_heartbeat', thirtyMinAgo);

  // 2. Antivirus coverage
  const { data: avData } = await supabase
    .from('agent_antivirus_status')
    .select('agent_id, antivirus_enabled')
    .eq('tenant_id', tenantId);
  
  const avEnabled = avData?.filter(a => a.antivirus_enabled).length || 0;
  const avTotal = avData?.length || 0;

  // 3. Critical vulnerabilities  
  const { count: criticalVulns } = await supabase
    .from('vulnerability_findings')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('severity', 'critical')
    .neq('status', 'resolved');

  // 4. Pending alerts
  const { count: pendingAlerts } = await supabase
    .from('security_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'open');

  // 5. AI Insights pending
  const { count: pendingInsights } = await supabase
    .from('ai_insights')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');

  // 6. Notification channels configured
  const { count: notifChannels } = await supabase
    .from('notification_channels')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  // 7. Security policies
  const { count: activePolicies } = await supabase
    .from('security_policies')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  // 8. Certificate issues
  const { count: expiredCerts } = await supabase
    .from('agent_certificates')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .lt('valid_until', new Date().toISOString());

  // ??? Identify gaps ??????????????????????????????????

  const gaps: SecurityGap[] = [];

  const offlineAgents = (totalAgents || 0) - (onlineAgents || 0);
  if (offlineAgents > 0) {
    gaps.push({
      area: 'agents',
      severity: offlineAgents > (totalAgents || 1) / 2 ? 'critical' : 'warning',
      metric: 'Agentes offline',
      currentValue: `${offlineAgents} de ${totalAgents}`,
      targetValue: '0 offline'
    });
  }

  if (avTotal > 0 && avEnabled < avTotal) {
    gaps.push({
      area: 'antivirus',
      severity: avEnabled === 0 ? 'critical' : 'warning',
      metric: 'Cobertura de antivirus',
      currentValue: `${avEnabled}/${avTotal}`,
      targetValue: `${avTotal}/${avTotal}`
    });
  }

  if ((criticalVulns || 0) > 0) {
    gaps.push({
      area: 'vulnerabilities',
      severity: 'critical',
      metric: 'Pontos fracos criticos',
      currentValue: criticalVulns || 0,
      targetValue: 0
    });
  }

  if ((pendingAlerts || 0) > 5) {
    gaps.push({
      area: 'alerts',
      severity: (pendingAlerts || 0) > 20 ? 'critical' : 'warning',
      metric: 'Alertas pendentes',
      currentValue: pendingAlerts || 0,
      targetValue: '< 5'
    });
  }

  if ((notifChannels || 0) === 0) {
    gaps.push({
      area: 'notifications',
      severity: 'warning',
      metric: 'Canais de notificacao',
      currentValue: 0,
      targetValue: '? 1'
    });
  }

  if ((activePolicies || 0) === 0) {
    gaps.push({
      area: 'policies',
      severity: 'warning',
      metric: 'Politicas de seguranca ativas',
      currentValue: 0,
      targetValue: '? 1'
    });
  }

  if ((expiredCerts || 0) > 0) {
    gaps.push({
      area: 'certificates',
      severity: 'warning',
      metric: 'Certificados expirados',
      currentValue: expiredCerts || 0,
      targetValue: 0
    });
  }

  if ((pendingInsights || 0) > 0) {
    gaps.push({
      area: 'insights',
      severity: 'info',
      metric: 'Sugestoes de IA pendentes',
      currentValue: pendingInsights || 0,
      targetValue: 0
    });
  }

  // ??? Generate AI recommendations ????????????????????

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  let aiTips: Array<Record<string, unknown>> = [];

  if (LOVABLE_API_KEY && gaps.length > 0) {
    try {
      const gapsSummary = gaps.map(g => 
        `- [${g.severity.toUpperCase()}] ${g.metric}: atual=${g.currentValue}, meta=${g.targetValue}`
      ).join('\n');

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            {
              role: 'system',
              content: `Voce e um consultor de seguranca cibernetica para PMEs. Gere recomendacoes praticas e simples em portugues brasileiro.
Regras:
- Sem jargoes tecnicos. Use linguagem acessivel.
- Cada dica deve ter: titulo curto, descricao de 1-2 frases, e um link de acao (caminho do modulo no sistema).
- Maximo 5 dicas, priorizadas por severidade.
- Responda APENAS com JSON valido, sem markdown.`
            },
            {
              role: 'user',
              content: `Analise estas lacunas de seguranca e gere recomendacoes praticas:\n\n${gapsSummary}\n\nModulos disponiveis no sistema:
- /admin/agent-center (Central de Agentes)
- /admin/security-monitoring (Alertas de Seguranca)
- /admin/vulnerabilities (Pontos Fracos)
- /admin/ai-insights (Sugestoes da IA)
- /admin/notification-settings (Configurar Notificacoes)
- /admin/security-policies (Politicas de Seguranca)
- /admin/diagnostics (Diagnostico de Problemas)
- /admin/compliance-hub (Conformidade)

Retorne um array JSON com objetos: { "title": string, "description": string, "severity": "info"|"warning"|"critical", "actionPath": string, "actionLabel": string }`
            }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'generate_tips',
                description: 'Generate security improvement tips',
                parameters: {
                  type: 'object',
                  properties: {
                    tips: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          title: { type: 'string' },
                          description: { type: 'string' },
                          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
                          actionPath: { type: 'string' },
                          actionLabel: { type: 'string' }
                        },
                        required: ['title', 'description', 'severity', 'actionPath', 'actionLabel'],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ['tips'],
                  additionalProperties: false
                }
              }
            }
          ],
          tool_choice: { type: 'function', function: { name: 'generate_tips' } }
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          aiTips = parsed.tips || [];
        }
      } else {
        logger.error(`[security-advisor][${requestId}] AI gateway error: ${aiResponse.status}`);
      }
    } catch (aiErr) {
      logger.error(`[security-advisor][${requestId}] AI generation failed:`, aiErr);
    }
  }

  // ??? Fallback static tips if AI fails ???????????????

  if (aiTips.length === 0 && gaps.length > 0) {
    const fallbackMap: Record<string, any> = {
      agents: { title: 'Verifique seus computadores', description: 'Alguns computadores estao sem comunicacao. Verifique se estao ligados e conectados.', actionPath: '/admin/agent-center', actionLabel: 'Ver computadores' },
      antivirus: { title: 'Ative a protecao antivirus', description: 'Nem todos os computadores tem antivirus ativo. Isso e essencial para a seguranca.', actionPath: '/admin/agent-center', actionLabel: 'Verificar protecao' },
      vulnerabilities: { title: 'Corrija os pontos fracos criticos', description: 'Existem problemas de seguranca que precisam de atencao imediata.', actionPath: '/admin/vulnerabilities', actionLabel: 'Ver pontos fracos' },
      alerts: { title: 'Revise os alertas pendentes', description: 'Voce tem alertas de seguranca aguardando revisao. Nao os ignore.', actionPath: '/admin/security-monitoring', actionLabel: 'Ver alertas' },
      notifications: { title: 'Configure notificacoes', description: 'Sem notificacoes, voce nao sera avisado sobre problemas. Configure pelo menos um canal.', actionPath: '/admin/notification-settings', actionLabel: 'Configurar' },
      policies: { title: 'Crie uma politica de seguranca', description: 'Defina regras automaticas para proteger sua rede de ameacas.', actionPath: '/admin/security-policies', actionLabel: 'Criar politica' },
      certificates: { title: 'Renove certificados expirados', description: 'Certificados vencidos podem causar falhas de seguranca e conexao.', actionPath: '/admin/agent-center', actionLabel: 'Ver detalhes' },
      insights: { title: 'Confira as sugestoes da IA', description: 'A inteligencia artificial encontrou melhorias para sua seguranca.', actionPath: '/admin/ai-insights', actionLabel: 'Ver sugestoes' },
    };

    for (const gap of gaps.slice(0, 5)) {
      const fb = fallbackMap[gap.area];
      if (fb) {
        aiTips.push({ ...fb, severity: gap.severity });
      }
    }
  }

  // ??? Calculate maturity level ???????????????????????

  let maturityScore = 100;
  for (const gap of gaps) {
    if (gap.severity === 'critical') maturityScore -= 25;
    else if (gap.severity === 'warning') maturityScore -= 10;
    else maturityScore -= 5;
  }
  maturityScore = Math.max(0, maturityScore);

  const maturityLevel = maturityScore >= 85 ? 'advanced' : maturityScore >= 60 ? 'intermediate' : 'basic';
  const maturityLabel = maturityLevel === 'advanced' ? 'Avancado' : maturityLevel === 'intermediate' ? 'Intermediario' : 'Basico';

  logger.info(`[security-advisor][${requestId}] Complete: ${aiTips.length} tips, maturity=${maturityLabel}`);

  return {
    tenant_id: tenantId,
    gaps,
    tips: aiTips,
    maturity: {
      score: maturityScore,
      level: maturityLevel,
      label: maturityLabel,
    },
    summary: {
      totalAgents: totalAgents || 0,
      onlineAgents: onlineAgents || 0,
      avCoverage: avTotal > 0 ? Math.round((avEnabled / avTotal) * 100) : 0,
      criticalVulns: criticalVulns || 0,
      pendingAlerts: pendingAlerts || 0,
    },
    generated_at: new Date().toISOString(),
  };
}, { methods: ['POST'] });
