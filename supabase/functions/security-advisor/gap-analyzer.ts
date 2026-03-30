/**
 * Gap analyzer for security-advisor
 */

export interface SecurityGap {
  area: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  currentValue: number | string;
  targetValue: number | string;
}

export interface PostureMetrics {
  totalAgents: number;
  onlineAgents: number;
  avEnabled: number;
  avTotal: number;
  criticalVulns: number;
  pendingAlerts: number;
  pendingInsights: number;
  notifChannels: number;
  activePolicies: number;
  expiredCerts: number;
}

export function analyzeGaps(metrics: PostureMetrics): SecurityGap[] {
  const gaps: SecurityGap[] = [];
  const offlineAgents = metrics.totalAgents - metrics.onlineAgents;

  if (offlineAgents > 0) {
    gaps.push({ area: 'agents', severity: offlineAgents > metrics.totalAgents / 2 ? 'critical' : 'warning', metric: 'Agentes offline', currentValue: `${offlineAgents} de ${metrics.totalAgents}`, targetValue: '0 offline' });
  }
  if (metrics.avTotal > 0 && metrics.avEnabled < metrics.avTotal) {
    gaps.push({ area: 'antivirus', severity: metrics.avEnabled === 0 ? 'critical' : 'warning', metric: 'Cobertura de antivirus', currentValue: `${metrics.avEnabled}/${metrics.avTotal}`, targetValue: `${metrics.avTotal}/${metrics.avTotal}` });
  }
  if (metrics.criticalVulns > 0) {
    gaps.push({ area: 'vulnerabilities', severity: 'critical', metric: 'Pontos fracos criticos', currentValue: metrics.criticalVulns, targetValue: 0 });
  }
  if (metrics.pendingAlerts > 5) {
    gaps.push({ area: 'alerts', severity: metrics.pendingAlerts > 20 ? 'critical' : 'warning', metric: 'Alertas pendentes', currentValue: metrics.pendingAlerts, targetValue: '< 5' });
  }
  if (metrics.notifChannels === 0) {
    gaps.push({ area: 'notifications', severity: 'warning', metric: 'Canais de notificacao', currentValue: 0, targetValue: '>= 1' });
  }
  if (metrics.activePolicies === 0) {
    gaps.push({ area: 'policies', severity: 'warning', metric: 'Politicas de seguranca ativas', currentValue: 0, targetValue: '>= 1' });
  }
  if (metrics.expiredCerts > 0) {
    gaps.push({ area: 'certificates', severity: 'warning', metric: 'Certificados expirados', currentValue: metrics.expiredCerts, targetValue: 0 });
  }
  if (metrics.pendingInsights > 0) {
    gaps.push({ area: 'insights', severity: 'info', metric: 'Sugestoes de IA pendentes', currentValue: metrics.pendingInsights, targetValue: 0 });
  }

  return gaps;
}

export function getFallbackTips(gaps: SecurityGap[]): Array<Record<string, unknown>> {
  const fallbackMap: Record<string, Record<string, string>> = {
    agents: { title: 'Verifique seus computadores', description: 'Alguns computadores estao sem comunicacao. Verifique se estao ligados e conectados.', actionPath: '/admin/agent-center', actionLabel: 'Ver computadores' },
    antivirus: { title: 'Ative a protecao antivirus', description: 'Nem todos os computadores tem antivirus ativo. Isso e essencial para a seguranca.', actionPath: '/admin/agent-center', actionLabel: 'Verificar protecao' },
    vulnerabilities: { title: 'Corrija os pontos fracos criticos', description: 'Existem problemas de seguranca que precisam de atencao imediata.', actionPath: '/admin/vulnerabilities', actionLabel: 'Ver pontos fracos' },
    alerts: { title: 'Revise os alertas pendentes', description: 'Voce tem alertas de seguranca aguardando revisao. Nao os ignore.', actionPath: '/admin/security-monitoring', actionLabel: 'Ver alertas' },
    notifications: { title: 'Configure notificacoes', description: 'Sem notificacoes, voce nao sera avisado sobre problemas. Configure pelo menos um canal.', actionPath: '/admin/notification-settings', actionLabel: 'Configurar' },
    policies: { title: 'Crie uma politica de seguranca', description: 'Defina regras automaticas para proteger sua rede de ameacas.', actionPath: '/admin/security-policies', actionLabel: 'Criar politica' },
    certificates: { title: 'Renove certificados expirados', description: 'Certificados vencidos podem causar falhas de seguranca e conexao.', actionPath: '/admin/agent-center', actionLabel: 'Ver detalhes' },
    insights: { title: 'Confira as sugestoes da IA', description: 'A inteligencia artificial encontrou melhorias para sua seguranca.', actionPath: '/admin/ai-insights', actionLabel: 'Ver sugestoes' },
  };

  const tips: Array<Record<string, unknown>> = [];
  for (const gap of gaps.slice(0, 5)) {
    const fb = fallbackMap[gap.area];
    if (fb) tips.push({ ...fb, severity: gap.severity });
  }
  return tips;
}

export function calculateMaturity(gaps: SecurityGap[]): { score: number; level: string; label: string } {
  let score = 100;
  for (const gap of gaps) {
    if (gap.severity === 'critical') score -= 25;
    else if (gap.severity === 'warning') score -= 10;
    else score -= 5;
  }
  score = Math.max(0, score);
  const level = score >= 85 ? 'advanced' : score >= 60 ? 'intermediate' : 'basic';
  const label = level === 'advanced' ? 'Avancado' : level === 'intermediate' ? 'Intermediario' : 'Basico';
  return { score, level, label };
}
