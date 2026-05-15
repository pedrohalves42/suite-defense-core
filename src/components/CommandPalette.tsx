import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command';
import {
  Home, Shield, AlertTriangle, Globe, AppWindow,
  FileBarChart, Settings, Users, Bell, Target, Activity,
  Brain, Terminal, Clock, Download, Zap, Crown, Scale,
  ClipboardCheck, Eye, Workflow, BarChart3,
  Star, Cpu, Presentation, Tag, ShieldCheck, Sparkles,
  AlertCircle, FileSearch, Lightbulb, BookOpen,
  Plug, Code, CreditCard, Archive, Fingerprint, Stethoscope,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { cn } from '@/lib/utils';

interface SearchableItem {
  label: string;
  path: string;
  icon: any;
  keywords: string[];
  section: string;
  /** Explicit RBAC permission key. Items without permission are visible to all authenticated users. */
  permission?: string;
}

const allPages: SearchableItem[] = [
  // Visão Geral
  { label: 'Painel Inicial', path: '/admin/dashboard', icon: Home, keywords: ['dashboard', 'inicio', 'home'], section: 'Visão Geral', permission: 'view_dashboard' },
  { label: 'Pendências', path: '/admin/action-center', icon: Target, keywords: ['ações', 'pendencias', 'urgente'], section: 'Visão Geral', permission: 'view_dashboard' },
  { label: 'Resumo Executivo', path: '/admin/executive', icon: Presentation, keywords: ['executivo', 'resumo', 'ceo'], section: 'Visão Geral', permission: 'view_reports' },
  { label: 'Meus Computadores', path: '/admin/agent-center', icon: Cpu, keywords: ['agentes', 'computadores', 'endpoints', 'máquinas'], section: 'Visão Geral', permission: 'view_agents' },
  { label: 'Tempo Real', path: '/admin/monitoring-advanced', icon: Activity, keywords: ['monitoramento', 'realtime', 'tempo real'], section: 'Visão Geral', permission: 'view_dashboard' },
  { label: 'Novo Cliente (Onboarding)', path: '/admin/onboarding', icon: Sparkles, keywords: ['onboarding', 'wizard', 'novo cliente', 'setup'], section: 'Visão Geral', permission: 'manage_tenant_settings' },

  // Proteção
  { label: 'Central de Ameaças', path: '/admin/threat-center', icon: AlertTriangle, keywords: ['ameaças', 'threats', 'alertas'], section: 'Proteção', permission: 'view_dashboard' },
  { label: 'Vulnerabilidades', path: '/admin/vulnerability-center', icon: ShieldCheck, keywords: ['vulnerabilidades', 'cve', 'patches'], section: 'Proteção', permission: 'view_dashboard' },
  { label: 'Segurança de Rede', path: '/admin/network-security', icon: Globe, keywords: ['rede', 'dns', 'web', 'network'], section: 'Proteção', permission: 'view_dashboard' },
  { label: 'Segurança de Ativos', path: '/admin/asset-security', icon: AppWindow, keywords: ['software', 'ativos', 'programas'], section: 'Proteção', permission: 'view_dashboard' },
  { label: 'Itens Suspeitos', path: '/quarantine', icon: AlertCircle, keywords: ['quarentena', 'suspeitos', 'isolados'], section: 'Proteção' },
  { label: 'Resolver Alertas', path: '/admin/alert-resolution', icon: AlertCircle, keywords: ['resolver', 'alertas', 'resolução'], section: 'Proteção', permission: 'execute_playbooks' },

  // Organização
  { label: 'Grupos de Agentes', path: '/admin/agent-center?tab=groups', icon: Users, keywords: ['grupos', 'agentes'], section: 'Organização', permission: 'manage_agents' },
  { label: 'Etiquetas', path: '/admin/agent-center?tab=tags', icon: Tag, keywords: ['tags', 'etiquetas', 'labels'], section: 'Organização', permission: 'manage_agents' },
  { label: 'Regras de Segurança', path: '/admin/security-policies', icon: Shield, keywords: ['políticas', 'regras', 'policies'], section: 'Organização', permission: 'manage_policies' },
  { label: 'Equipe', path: '/admin/members', icon: Crown, keywords: ['membros', 'equipe', 'team'], section: 'Organização', permission: 'manage_users' },
  { label: 'Relatórios', path: '/admin/reports', icon: FileBarChart, keywords: ['relatórios', 'reports', 'pdf'], section: 'Organização', permission: 'view_reports' },
  { label: 'Avisos', path: '/admin/notification-channels', icon: Bell, keywords: ['notificações', 'avisos', 'canais'], section: 'Organização', permission: 'manage_tenant_settings' },
  { label: 'Configurações', path: '/admin/tenant', icon: Settings, keywords: ['configurações', 'settings', 'tenant'], section: 'Organização', permission: 'manage_tenant_settings' },

  // Normas
  { label: 'SOC 2', path: '/admin/soc2-compliance', icon: ClipboardCheck, keywords: ['soc2', 'compliance', 'conformidade'], section: 'Normas', permission: 'view_audit_logs' },
  { label: 'Histórico de Ações', path: '/admin/system-audit', icon: FileSearch, keywords: ['auditoria', 'histórico', 'audit'], section: 'Normas', permission: 'view_audit_logs' },
  { label: 'Linha do Tempo', path: '/admin/compliance-timeline', icon: Scale, keywords: ['timeline', 'compliance'], section: 'Normas', permission: 'view_audit_logs' },
  { label: 'Governança', path: '/admin/governance', icon: Eye, keywords: ['governança', 'controle'], section: 'Normas', permission: 'view_audit_logs' },
  { label: 'Playbooks', path: '/admin/playbooks', icon: Workflow, keywords: ['playbooks', 'procedimentos', 'soar'], section: 'Normas', permission: 'execute_playbooks' },
  { label: 'Nível de Risco', path: '/admin/risk-score', icon: BarChart3, keywords: ['risco', 'risk', 'score'], section: 'Normas', permission: 'view_dashboard' },
  { label: 'Comparativo', path: '/admin/security-benchmark', icon: Target, keywords: ['benchmark', 'comparativo'], section: 'Normas', permission: 'view_dashboard' },

  // Automação
  { label: 'Regras Automáticas', path: '/admin/rules-management', icon: Brain, keywords: ['regras', 'automáticas', 'rules'], section: 'Automação', permission: 'manage_policies' },
  { label: 'Sugestões IA', path: '/admin/ai-insights', icon: Lightbulb, keywords: ['ia', 'ai', 'insights', 'sugestões'], section: 'Automação', permission: 'view_ai_decisions' },
  { label: 'Correção Automática', path: '/admin/auto-remediation', icon: Zap, keywords: ['remediação', 'correção', 'soar'], section: 'Automação', permission: 'execute_playbooks' },
  { label: 'Tarefas Agendadas', path: '/admin/automations', icon: Clock, keywords: ['cron', 'agendadas', 'automações'], section: 'Automação', permission: 'manage_jobs' },
  { label: 'Base de Conhecimento', path: '/admin/software-knowledge-base', icon: BookOpen, keywords: ['conhecimento', 'software', 'base'], section: 'Automação', permission: 'view_dashboard' },

  // Ferramentas
  { label: 'Instalações', path: '/admin/installations', icon: Download, keywords: ['instalar', 'download', 'enrollment'], section: 'Ferramentas', permission: 'manage_agents' },
  { label: 'Diagnóstico', path: '/admin/diagnostics', icon: Terminal, keywords: ['diagnóstico', 'debug', 'terminal'], section: 'Ferramentas', permission: 'view_audit_logs' },
  { label: 'Diagnóstico em Tempo Real', path: '/admin/runtime-diagnostics', icon: Stethoscope, keywords: ['runtime', 'realtime', 'canal', 'sessão', 'tenant', 'logs'], section: 'Ferramentas', permission: 'manage_tenant_settings' },
  { label: 'Minha Conta', path: '/admin/my-account', icon: Fingerprint, keywords: ['conta', 'perfil', 'mfa'], section: 'Ferramentas' },
  { label: 'Planos', path: '/admin/plan-upgrade', icon: CreditCard, keywords: ['plano', 'upgrade', 'assinatura'], section: 'Ferramentas', permission: 'manage_tenant_settings' },
  { label: 'Inativos', path: '/admin/agent-center?tab=archived', icon: Archive, keywords: ['inativos', 'arquivados', 'archived'], section: 'Ferramentas', permission: 'manage_agents' },
  { label: 'API', path: '/admin/api-docs', icon: Code, keywords: ['api', 'documentação', 'rest'], section: 'Ferramentas', permission: 'manage_tenant_settings' },
  { label: 'Integrações', path: '/admin/itsm', icon: Plug, keywords: ['itsm', 'integrações', 'conectar'], section: 'Ferramentas', permission: 'manage_tenant_settings' },
];

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { can, loading: permissionsLoading, role } = useRolePermissions();

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('open-search', handleOpen);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('open-search', handleOpen);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // P-AUDIT: Filter pages by explicit RBAC permission. Items without
  // a `permission` field are visible to all authenticated users.
  const visiblePages = useMemo(() => {
    if (permissionsLoading || !role) return [];
    return allPages.filter((p) => !p.permission || can(p.permission));
  }, [can, permissionsLoading, role]);

  const favoriteItems = useMemo(
    () => visiblePages.filter(p => favorites.includes(p.path)),
    [favorites, visiblePages]
  );

  const sections = useMemo(() => {
    const map = new Map<string, SearchableItem[]>();
    for (const item of visiblePages) {
      const list = map.get(item.section) || [];
      list.push(item);
      map.set(item.section, list);
    }
    return map;
  }, [visiblePages]);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, recursos, ações..." />
      <CommandList>
        <CommandEmpty>
          {permissionsLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
              <span>Validando permissões...</span>
            </div>
          ) : "Nenhum resultado encontrado."}
        </CommandEmpty>

        {favoriteItems.length > 0 && (
          <>
            <CommandGroup heading="⭐ Favoritos">
              {favoriteItems.map(item => (
                <CommandItem
                  key={`fav-${item.path}`}
                  value={`fav ${item.label} ${item.keywords.join(' ')}`}
                  onSelect={() => handleSelect(item.path)}
                  className="flex items-center gap-3"
                >
                  <item.icon className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item.path); }}
                    className="text-primary hover:text-primary/80"
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {Array.from(sections.entries()).map(([section, items]) => (
          <CommandGroup key={section} heading={section}>
            {items.map(item => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords.join(' ')} ${item.section}`}
                onSelect={() => handleSelect(item.path)}
                className="flex items-center gap-3"
              >
                <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{item.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(item.path); }}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity",
                    isFavorite(item.path) ? "text-primary opacity-100" : "text-muted-foreground"
                  )}
                >
                  <Star className={cn("h-3.5 w-3.5", isFavorite(item.path) && "fill-current")} />
                </button>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};
