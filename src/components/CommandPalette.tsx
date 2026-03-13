import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command';
import {
  Home, Shield, AlertTriangle, Monitor, Globe, AppWindow,
  FileBarChart, Settings, Users, Bell, Target, Activity,
  Brain, Terminal, Clock, Download, Zap, Crown, Scale,
  ClipboardCheck, Eye, Workflow, BarChart3, Crosshair,
  Search, Star, Cpu, Presentation, Tag, ShieldCheck,
  AlertCircle, FileSearch, Key, Lightbulb, BookOpen,
  Plug, Code, CreditCard, Archive, Fingerprint,
} from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { cn } from '@/lib/utils';

interface SearchableItem {
  label: string;
  path: string;
  icon: any;
  keywords: string[];
  section: string;
}

const allPages: SearchableItem[] = [
  // Overview
  { label: 'Painel Inicial', path: '/admin/dashboard', icon: Home, keywords: ['dashboard', 'inicio', 'home'], section: 'Visão Geral' },
  { label: 'Pendências', path: '/admin/action-center', icon: Target, keywords: ['ações', 'pendencias', 'urgente'], section: 'Visão Geral' },
  { label: 'Resumo Executivo', path: '/admin/executive', icon: Presentation, keywords: ['executivo', 'resumo', 'ceo'], section: 'Visão Geral' },
  { label: 'Meus Computadores', path: '/admin/agent-center', icon: Cpu, keywords: ['agentes', 'computadores', 'endpoints', 'máquinas'], section: 'Visão Geral' },
  { label: 'Tempo Real', path: '/admin/monitoring-advanced', icon: Activity, keywords: ['monitoramento', 'realtime', 'tempo real'], section: 'Visão Geral' },

  // Proteção
  { label: 'Central de Ameaças', path: '/admin/threat-center', icon: AlertTriangle, keywords: ['ameaças', 'threats', 'alertas'], section: 'Proteção' },
  { label: 'Vulnerabilidades', path: '/admin/vulnerability-center', icon: ShieldCheck, keywords: ['vulnerabilidades', 'cve', 'patches'], section: 'Proteção' },
  { label: 'Segurança de Rede', path: '/admin/network-security', icon: Globe, keywords: ['rede', 'dns', 'web', 'network'], section: 'Proteção' },
  { label: 'Segurança de Ativos', path: '/admin/asset-security', icon: AppWindow, keywords: ['software', 'ativos', 'programas'], section: 'Proteção' },
  { label: 'Itens Suspeitos', path: '/quarantine', icon: AlertCircle, keywords: ['quarentena', 'suspeitos', 'isolados'], section: 'Proteção' },
  { label: 'Resolver Alertas', path: '/admin/alert-resolution', icon: AlertCircle, keywords: ['resolver', 'alertas', 'resolução'], section: 'Proteção' },

  // Organização
  { label: 'Grupos de Agentes', path: '/admin/agent-center?tab=groups', icon: Users, keywords: ['grupos', 'agentes'], section: 'Organização' },
  { label: 'Etiquetas', path: '/admin/agent-center?tab=tags', icon: Tag, keywords: ['tags', 'etiquetas', 'labels'], section: 'Organização' },
  { label: 'Regras de Segurança', path: '/admin/security-policies', icon: Shield, keywords: ['políticas', 'regras', 'policies'], section: 'Organização' },
  { label: 'Equipe', path: '/admin/members', icon: Crown, keywords: ['membros', 'equipe', 'team'], section: 'Organização' },
  { label: 'Relatórios', path: '/admin/reports', icon: FileBarChart, keywords: ['relatórios', 'reports', 'pdf'], section: 'Organização' },
  { label: 'Avisos', path: '/admin/notification-channels', icon: Bell, keywords: ['notificações', 'avisos', 'canais'], section: 'Organização' },
  { label: 'Configurações', path: '/admin/tenant', icon: Settings, keywords: ['configurações', 'settings', 'tenant'], section: 'Organização' },

  // Compliance
  { label: 'SOC 2', path: '/admin/soc2-compliance', icon: ClipboardCheck, keywords: ['soc2', 'compliance', 'conformidade'], section: 'Normas' },
  { label: 'Histórico de Ações', path: '/admin/system-audit', icon: FileSearch, keywords: ['auditoria', 'histórico', 'audit'], section: 'Normas' },
  { label: 'Linha do Tempo', path: '/admin/compliance-timeline', icon: Scale, keywords: ['timeline', 'compliance'], section: 'Normas' },
  { label: 'Governança', path: '/admin/governance', icon: Eye, keywords: ['governança', 'controle'], section: 'Normas' },
  { label: 'Playbooks', path: '/admin/playbooks', icon: Workflow, keywords: ['playbooks', 'procedimentos', 'soar'], section: 'Normas' },
  { label: 'Nível de Risco', path: '/admin/risk-score', icon: BarChart3, keywords: ['risco', 'risk', 'score'], section: 'Normas' },
  { label: 'Comparativo', path: '/admin/security-benchmark', icon: Target, keywords: ['benchmark', 'comparativo'], section: 'Normas' },

  // Automação
  { label: 'Regras Automáticas', path: '/admin/rules-management', icon: Brain, keywords: ['regras', 'automáticas', 'rules'], section: 'Automação' },
  { label: 'Sugestões IA', path: '/admin/ai-insights', icon: Lightbulb, keywords: ['ia', 'ai', 'insights', 'sugestões'], section: 'Automação' },
  { label: 'Correção Automática', path: '/admin/auto-remediation', icon: Zap, keywords: ['remediação', 'correção', 'soar'], section: 'Automação' },
  { label: 'Tarefas Agendadas', path: '/admin/automations', icon: Clock, keywords: ['cron', 'agendadas', 'automações'], section: 'Automação' },
  { label: 'Base de Conhecimento', path: '/admin/software-knowledge-base', icon: BookOpen, keywords: ['conhecimento', 'software', 'base'], section: 'Automação' },

  // Ferramentas
  { label: 'Instalações', path: '/admin/installations', icon: Download, keywords: ['instalar', 'download', 'enrollment'], section: 'Ferramentas' },
  { label: 'Diagnóstico', path: '/admin/diagnostics', icon: Terminal, keywords: ['diagnóstico', 'debug', 'terminal'], section: 'Ferramentas' },
  { label: 'Minha Conta', path: '/admin/my-account', icon: Fingerprint, keywords: ['conta', 'perfil', 'mfa'], section: 'Ferramentas' },
  { label: 'Planos', path: '/admin/plan-upgrade', icon: CreditCard, keywords: ['plano', 'upgrade', 'assinatura'], section: 'Ferramentas' },
  { label: 'Inativos', path: '/admin/agent-center?tab=archived', icon: Archive, keywords: ['inativos', 'arquivados', 'archived'], section: 'Ferramentas' },
  { label: 'API', path: '/admin/api-docs', icon: Code, keywords: ['api', 'documentação', 'rest'], section: 'Ferramentas' },
  { label: 'Integrações', path: '/admin/itsm', icon: Plug, keywords: ['itsm', 'integrações', 'conectar'], section: 'Ferramentas' },
];

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

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

  const favoriteItems = useMemo(
    () => allPages.filter(p => favorites.includes(p.path)),
    [favorites]
  );

  const sections = useMemo(() => {
    const map = new Map<string, SearchableItem[]>();
    for (const item of allPages) {
      const list = map.get(item.section) || [];
      list.push(item);
      map.set(item.section, list);
    }
    return map;
  }, []);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar páginas, recursos, ações..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

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
                    className="text-yellow-500 hover:text-yellow-400"
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
                    isFavorite(item.path) ? "text-yellow-500 opacity-100" : "text-muted-foreground"
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
