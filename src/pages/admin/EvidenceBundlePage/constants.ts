export const EVIDENCE_OPTIONS = [
  { key: 'securityEvents', label: 'Eventos de Segurança', icon: '🔒', description: 'Alertas, ameaças e incidentes detectados' },
  { key: 'jobs', label: 'Jobs Executados', icon: '⚙️', description: 'Tarefas de remediação, scans e coletas' },
  { key: 'signatures', label: 'Assinaturas Digitais', icon: '✍️', description: 'Execuções assinadas com ECDSA P-256' },
  { key: 'hashChain', label: 'Cadeia de Hash', icon: '🔗', description: 'Prova criptográfica de integridade' },
  { key: 'riskDecisions', label: 'Decisões de Risco', icon: '⚖️', description: 'Avaliações autônomas e classificações' },
  { key: 'playbookExecutions', label: 'Playbooks SOAR', icon: '📋', description: 'Automações de resposta executadas' },
  { key: 'auditLogs', label: 'Logs de Auditoria', icon: '📝', description: 'Trilha de auditoria imutável completa' },
] as const;

export interface ExportResult {
  auditId: string;
  manifestHash: string;
  verificationUrl: string;
  recordCount: number;
  sizeBytes: number;
  bundle?: Record<string, unknown>;
}
