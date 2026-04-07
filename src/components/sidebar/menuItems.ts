import { 
  Home, Shield, Users, ScrollText, Settings, 
  Server, Activity, CreditCard, Crown, BarChart3, AlertTriangle, 
  Brain, Terminal, Globe, Clock, Gauge, 
  Bell, TrendingUp, PieChart, Target, DollarSign, Presentation, Scale, 
  Heart, Monitor, AppWindow, GitBranch,
  Download, FileText, Cpu, Percent, ClipboardCheck, FileBarChart,
  AlertCircle, Wrench, Key, ShieldCheck, FileSearch,
  Zap, ListTodo, BookOpen, ShieldAlert, Fingerprint,
  Eye, Workflow, Plug, Palette, Map, Code,
  BrainCircuit, Sparkles, BarChart, Bot
} from 'lucide-react';

export interface MenuItem {
  icon: any;
  label: string;
  to: string;
  end?: boolean;
  badge?: number;
}

export function getOverviewItems(urgentCount: number): MenuItem[] {
  return [
    { icon: Target, label: 'Pendências', to: '/admin/action-center', end: true, badge: urgentCount > 0 ? urgentCount : undefined },
    { icon: Home, label: 'Início', to: '/admin/dashboard' },
    { icon: Presentation, label: 'Resumo Executivo', to: '/admin/executive' },
    { icon: Cpu, label: 'Meus Computadores', to: '/admin/agent-center' },
    { icon: Activity, label: 'Tempo Real', to: '/admin/monitoring-advanced' },
    { icon: ListTodo, label: 'Tarefas', to: '/admin/tasks' },
    { icon: Sparkles, label: 'Novo Cliente', to: '/admin/onboarding' },
  ];
}

export const securityItems: MenuItem[] = [
  { icon: AlertTriangle, label: 'Alertas de Segurança', to: '/admin/threat-center' },
  { icon: ShieldCheck, label: 'Pontos Fracos', to: '/admin/vulnerability-center' },
  { icon: Globe, label: 'Internet e Navegação', to: '/admin/network-security' },
  { icon: AppWindow, label: 'Programas e Dispositivos', to: '/admin/asset-security' },
  { icon: AlertCircle, label: 'Alertas', to: '/quarantine' },
  { icon: ShieldAlert, label: 'Monitoramento Contínuo', to: '/admin/realtime-security' },
];

export const managementItems: MenuItem[] = [
  { icon: Shield, label: 'Regras', to: '/admin/security-policies' },
  { icon: Crown, label: 'Equipe', to: '/admin/members' },
  { icon: FileBarChart, label: 'Relatórios', to: '/admin/reports' },
  { icon: Bell, label: 'Avisos', to: '/admin/notification-channels' },
  { icon: Settings, label: 'Configurações', to: '/admin/tenant' },
];

export const complianceItems: MenuItem[] = [
  { icon: ClipboardCheck, label: 'Visão Geral', to: '/admin/compliance-hub' },
  { icon: FileSearch, label: 'Registros e Evidências', to: '/admin/compliance-hub?tab=evidence' },
  { icon: Workflow, label: 'Planos de Ação', to: '/admin/compliance-hub?tab=procedures' },
  { icon: BarChart3, label: 'Risco', to: '/admin/compliance-hub?tab=risk' },
];

export function getIntelligenceItems(criticalInsightsCount: number): MenuItem[] {
  return [
    { icon: BrainCircuit, label: 'Sugestões', to: '/admin/intelligence-hub', badge: criticalInsightsCount > 0 ? criticalInsightsCount : undefined },
    { icon: Zap, label: 'Automação', to: '/admin/intelligence-hub?tab=automation' },
    { icon: Eye, label: 'Revisão de Decisões', to: '/admin/intelligence-hub?tab=governance' },
    { icon: BookOpen, label: 'Conhecimento', to: '/admin/intelligence-hub?tab=knowledge' },
  ];
}

export const advancedItems: MenuItem[] = [
  { icon: Download, label: 'Instalações', to: '/admin/installations' },
  { icon: GitBranch, label: 'Atualizações', to: '/admin/agent-releases' },
  { icon: Terminal, label: 'Diagnóstico', to: '/admin/diagnostics' },
  { icon: Clock, label: 'Automação', to: '/admin/automations' },
  { icon: Fingerprint, label: 'Conta', to: '/admin/my-account' },
];

export const superOpsItems: MenuItem[] = [
  { icon: Server, label: 'Empresas', to: '/super-admin/tenants', end: true },
  { icon: Key, label: 'Chaves de Cadastro', to: '/super-admin/enrollment-keys' },
  { icon: Percent, label: 'Distribuição Gradual', to: '/super-admin/rollout-policies' },
  { icon: Users, label: 'Usuários', to: '/super-admin/users' },
  { icon: Shield, label: 'Funcionalidades', to: '/super-admin/features' },
  { icon: Clock, label: 'Suspensão', to: '/super-admin/tenant-suspension' },
];

export const superFinanceItems: MenuItem[] = [
  { icon: BarChart3, label: 'Métricas', to: '/super-admin/metrics' },
  { icon: PieChart, label: 'Assinaturas', to: '/super-admin/subscription-analytics' },
  { icon: DollarSign, label: 'Indicadores', to: '/super-admin/unit-economics' },
  { icon: TrendingUp, label: 'Retenção', to: '/super-admin/cohort-analysis' },
  { icon: Target, label: 'Projeções', to: '/super-admin/revenue-projections' },
  { icon: Presentation, label: 'Funil de Vendas', to: '/super-admin/sales-pipeline' },
  { icon: Scale, label: 'Apresentação', to: '/super-admin/pitch-deck' },
  { icon: AlertTriangle, label: 'Riscos', to: '/super-admin/risk-analysis' },
  { icon: CreditCard, label: 'Pagamentos', to: '/super-admin/stripe-setup' },
];

export const superSystemItems: MenuItem[] = [
  { icon: ScrollText, label: 'Auditoria', to: '/super-admin/audit-logs' },
  { icon: Activity, label: 'Logs', to: '/super-admin/system-logs' },
  { icon: Gauge, label: 'Operações', to: '/admin/operations-hub' },
  { icon: Heart, label: 'Saúde', to: '/admin/operations-hub?tab=health' },
  { icon: BarChart, label: 'Performance', to: '/admin/operations-hub?tab=performance' },
  { icon: Wrench, label: 'Ferramentas', to: '/admin/operations-hub?tab=tools' },
];

export const superAIItems: MenuItem[] = [
  { icon: BarChart, label: 'Métricas IA', to: '/admin/ai-metrics' },
  { icon: Eye, label: 'Revisão IA', to: '/admin/ai-governance' },
  { icon: Bot, label: 'Autonomia IA', to: '/admin/ai-autonomy' },
];

export const superIntegrationsItems: MenuItem[] = [
  { icon: Plug, label: 'Service Desk', to: '/admin/itsm' },
  { icon: FileText, label: 'Exportar Logs', to: '/admin/siem-export' },
  { icon: Palette, label: 'Marca Própria', to: '/admin/white-label' },
  { icon: Map, label: 'Plataformas', to: '/admin/platforms' },
  { icon: Code, label: 'API', to: '/admin/api-docs' },
  { icon: Bell, label: 'Notificações', to: '/admin/notification-settings' },
];
