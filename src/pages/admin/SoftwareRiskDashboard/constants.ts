import { Shield, AlertTriangle, AlertOctagon, CheckCircle, HelpCircle, Eye, Zap, Ban } from 'lucide-react';

export const RISK_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield; bgClass: string }> = {
  critical: { label: 'Crítico', color: 'hsl(var(--destructive))', icon: AlertOctagon, bgClass: 'bg-destructive/10 text-destructive border-destructive/30' },
  high: { label: 'Alto', color: 'hsl(var(--warning))', icon: AlertTriangle, bgClass: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  medium: { label: 'Médio', color: 'hsl(45, 93%, 47%)', icon: Shield, bgClass: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  low: { label: 'Baixo', color: 'hsl(var(--success))', icon: CheckCircle, bgClass: 'bg-success/10 text-success border-success/30' },
  unknown: { label: 'Não Classificado', color: 'hsl(var(--muted-foreground))', icon: HelpCircle, bgClass: 'bg-muted text-muted-foreground border-border' },
};

export const CATEGORY_LABELS: Record<string, string> = {
  remote_access: 'Acesso Remoto', p2p: 'P2P / Torrent', browser: 'Navegador', security: 'Segurança',
  utility: 'Utilitário', business: 'Negócios', meeting: 'Reuniões', messaging: 'Mensagens',
  development: 'Desenvolvimento', vpn_free: 'VPN Gratuita', vpn: 'VPN', adware: 'Adware',
  gaming: 'Jogos', anti_detect: 'Anti-Detect', virtualization: 'Virtualização', runtime: 'Runtime',
  system: 'Sistema', driver: 'Driver', network: 'Rede', multimedia: 'Multimídia',
  cloud_storage: 'Cloud Storage', peripheral: 'Periférico', uncategorized: 'Não Categorizado',
};

export const POLICY_MODE_CONFIG: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  observation: { label: 'Observação', icon: Eye, color: 'text-blue-400' },
  alert: { label: 'Alerta', icon: Zap, color: 'text-amber-400' },
  block: { label: 'Bloqueio', icon: Ban, color: 'text-destructive' },
};
