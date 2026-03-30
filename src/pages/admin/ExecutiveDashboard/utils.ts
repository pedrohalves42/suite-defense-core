export function translateCategory(cat: string): string {
  const map: Record<string, string> = {
    vulnerability_management: 'Gestão de Vulnerabilidades',
    agent_health: 'Saúde dos Agentes',
    certificate_management: 'Certificados Digitais',
    usb_security: 'Segurança USB',
    incident_response: 'Resposta a Incidentes',
    audit_trail: 'Trilha de Auditoria',
  };
  return map[cat] || cat;
}

export function getHealthStatus(score: number) {
  if (score >= 90) return { status: 'excellent' as const, message: 'Sua empresa está protegida', color: 'text-success', bgClass: 'border-success/20 bg-gradient-to-br from-success/8 to-success/3' };
  if (score >= 70) return { status: 'good' as const, message: 'Proteção ativa na sua empresa', color: 'text-success', bgClass: 'border-success/15 bg-gradient-to-br from-success/6 to-transparent' };
  if (score >= 50) return { status: 'warning' as const, message: 'Sua empresa precisa de atenção', color: 'text-warning', bgClass: 'border-warning/20 bg-gradient-to-br from-warning/8 to-warning/3' };
  return { status: 'critical' as const, message: 'Risco elevado para sua empresa', color: 'text-destructive', bgClass: 'border-destructive/20 bg-gradient-to-br from-destructive/8 to-destructive/3' };
}
