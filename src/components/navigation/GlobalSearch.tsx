import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { supabase } from '@/integrations/supabase/client';
import { 
  Search, 
  Monitor, 
  FileText, 
  Settings, 
  Shield, 
  Activity, 
  AlertTriangle,
  Users,
  Key,
  Bell,
  Zap,
  BarChart3,
  Command,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchResult {
  id: string;
  type: 'page' | 'agent' | 'action';
  title: string;
  description?: string;
  icon: React.ReactNode;
  path: string;
  category: string;
}

const PAGES: SearchResult[] = [
  { id: 'executive', type: 'page', title: 'Dashboard Executivo', description: 'Visão geral simplificada', icon: <BarChart3 className="h-4 w-4" />, path: '/admin/executive', category: 'Dashboard' },
  { id: 'action-center', type: 'page', title: 'Central de Ações', description: 'Alertas e tarefas pendentes', icon: <Zap className="h-4 w-4" />, path: '/admin/action-center', category: 'Dashboard' },
  { id: 'dashboard', type: 'page', title: 'Dashboard Completo', description: 'Métricas detalhadas', icon: <Activity className="h-4 w-4" />, path: '/admin/dashboard', category: 'Dashboard' },
  { id: 'agents', type: 'page', title: 'Gerenciar Agentes', description: 'Lista de computadores', icon: <Monitor className="h-4 w-4" />, path: '/agents', category: 'Agentes' },
  { id: 'agent-health', type: 'page', title: 'Saúde dos Agentes', description: 'Status e diagnósticos', icon: <Shield className="h-4 w-4" />, path: '/admin/agent-health', category: 'Agentes' },
  { id: 'installer', type: 'page', title: 'Instalar Agente', description: 'Baixar instalador', icon: <Monitor className="h-4 w-4" />, path: '/installer', category: 'Agentes' },
  { id: 'software-inventory', type: 'page', title: 'Inventário de Software', description: 'Programas instalados', icon: <FileText className="h-4 w-4" />, path: '/admin/software-inventory', category: 'Inventário' },
  { id: 'vulnerabilities', type: 'page', title: 'Vulnerabilidades', description: 'CVEs detectadas', icon: <AlertTriangle className="h-4 w-4" />, path: '/admin/vulnerabilities', category: 'Segurança' },
  { id: 'reports', type: 'page', title: 'Relatórios', description: 'Gerar relatórios de segurança', icon: <FileText className="h-4 w-4" />, path: '/admin/reports', category: 'Relatórios' },
  { id: 'evidence-bundle', type: 'page', title: 'Evidence Bundle', description: 'Pacote de evidências para auditoria', icon: <Shield className="h-4 w-4" />, path: '/admin/evidence-bundle', category: 'Relatórios' },
  { id: 'ai-insights', type: 'page', title: 'Insights IA', description: 'Sugestões inteligentes', icon: <Zap className="h-4 w-4" />, path: '/admin/ai-insights', category: 'IA' },
  { id: 'playbooks', type: 'page', title: 'Playbooks', description: 'Automações e regras', icon: <Zap className="h-4 w-4" />, path: '/admin/playbooks', category: 'Automação' },
  { id: 'notification-channels', type: 'page', title: 'Canais de Notificação', description: 'Email, WhatsApp, Telegram', icon: <Bell className="h-4 w-4" />, path: '/admin/notification-channels', category: 'Configurações' },
  { id: 'members', type: 'page', title: 'Membros da Equipe', description: 'Gerenciar usuários', icon: <Users className="h-4 w-4" />, path: '/admin/members', category: 'Configurações' },
  { id: 'enrollment-keys', type: 'page', title: 'Chaves de Instalação', description: 'Gerenciar chaves', icon: <Key className="h-4 w-4" />, path: '/super-admin/enrollment-keys', category: 'Configurações' },
  { id: 'settings', type: 'page', title: 'Configurações', description: 'Preferências do sistema', icon: <Settings className="h-4 w-4" />, path: '/super-admin/settings', category: 'Configurações' },
];

const QUICK_ACTIONS: SearchResult[] = [
  { id: 'new-agent', type: 'action', title: 'Instalar novo agente', icon: <Monitor className="h-4 w-4" />, path: '/installer', category: 'Ação Rápida' },
  { id: 'new-report', type: 'action', title: 'Gerar relatório', icon: <FileText className="h-4 w-4" />, path: '/admin/reports', category: 'Ação Rápida' },
  { id: 'config-notifications', type: 'action', title: 'Configurar notificações', icon: <Bell className="h-4 w-4" />, path: '/admin/notification-channels', category: 'Ação Rápida' },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [agentResults, setAgentResults] = useState<SearchResult[]>([]);
  const [isSearchingAgents, setIsSearchingAgents] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const navigate = useNavigate();
  const { activeTenant } = useActiveTenant();
  const debouncedQuery = useDebounce(query, 300);

  // Registrar atalho Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      
      if (open) {
        if (e.key === 'Escape') {
          setOpen(false);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = allResults[selectedIndex];
          if (selected) {
            handleSelect(selected);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, selectedIndex]);

  // Buscar agentes
  useEffect(() => {
    const searchAgents = async () => {
      if (!debouncedQuery || debouncedQuery.length < 2 || !activeTenant?.id) {
        setAgentResults([]);
        return;
      }

      setIsSearchingAgents(true);
      
      try {
        // ADR-026: Use agents_safe view to protect hmac_secret
        const { data } = await supabase
          .from('agents_safe')
          .select('id, agent_name, agent_state, last_heartbeat')
          .eq('tenant_id', activeTenant.id)
          .is('archived_at', null)
          .ilike('agent_name', `%${debouncedQuery}%`)
          .limit(5);

        const results: SearchResult[] = (data || []).map(agent => ({
          id: agent.id,
          type: 'agent' as const,
          title: agent.agent_name,
          description: agent.agent_state === 'online' ? 'Online' : 'Offline',
          icon: <Monitor className="h-4 w-4" />,
          path: `/admin/agent-health?agent=${agent.id}`,
          category: 'Agentes'
        }));

        setAgentResults(results);
      } catch (e) {
        console.error('Error searching agents:', e);
      } finally {
        setIsSearchingAgents(false);
      }
    };

    searchAgents();
  }, [debouncedQuery, activeTenant?.id]);

  // Filtrar páginas e ações
  const filteredPages = useMemo(() => {
    if (!query) return PAGES.slice(0, 6);
    const q = query.toLowerCase();
    return PAGES.filter(p => 
      p.title.toLowerCase().includes(q) || 
      p.description?.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }, [query]);

  const filteredActions = useMemo(() => {
    if (!query) return QUICK_ACTIONS;
    const q = query.toLowerCase();
    return QUICK_ACTIONS.filter(a => 
      a.title.toLowerCase().includes(q)
    );
  }, [query]);

  const allResults = useMemo(() => {
    return [...filteredActions, ...agentResults, ...filteredPages];
  }, [filteredActions, agentResults, filteredPages]);

  // Reset selected index quando resultados mudam
  useEffect(() => {
    setSelectedIndex(0);
  }, [allResults.length]);

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.path);
    setOpen(false);
    setQuery('');
  }, [navigate]);

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      {/* Trigger Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="p-0 sm:max-w-xl">
          {/* Search Input */}
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar páginas, agentes, ações..."
              className="border-0 focus-visible:ring-0 text-base"
              autoFocus
            />
            {isSearchingAgents && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Results */}
          <ScrollArea className="max-h-[400px]">
            <div className="p-2">
              {allResults.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum resultado encontrado</p>
                </div>
              ) : (
                <>
                  {/* Quick Actions */}
                  {filteredActions.length > 0 && (
                    <div className="mb-4">
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        Ações Rápidas
                      </p>
                      {filteredActions.map((action, index) => (
                        <ResultItem
                          key={action.id}
                          result={action}
                          isSelected={index === selectedIndex}
                          onSelect={() => handleSelect(action)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Agents */}
                  {agentResults.length > 0 && (
                    <div className="mb-4">
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        Agentes
                      </p>
                      {agentResults.map((agent, index) => (
                        <ResultItem
                          key={agent.id}
                          result={agent}
                          isSelected={index + filteredActions.length === selectedIndex}
                          onSelect={() => handleSelect(agent)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pages */}
                  {filteredPages.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                        Páginas
                      </p>
                      {filteredPages.map((page, index) => (
                        <ResultItem
                          key={page.id}
                          result={page}
                          isSelected={index + filteredActions.length + agentResults.length === selectedIndex}
                          onSelect={() => handleSelect(page)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <kbd className="rounded border bg-muted px-1.5 py-0.5">↑↓</kbd>
              <span>navegar</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5">↵</kbd>
              <span>selecionar</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded border bg-muted px-1.5 py-0.5">esc</kbd>
              <span>fechar</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultItem({ 
  result, 
  isSelected, 
  onSelect 
}: { 
  result: SearchResult; 
  isSelected: boolean; 
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <div className={cn(
        "p-1.5 rounded",
        result.type === 'action' ? "bg-primary/10 text-primary" : "bg-muted"
      )}>
        {result.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{result.title}</p>
        {result.description && (
          <p className="text-xs text-muted-foreground truncate">{result.description}</p>
        )}
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">
        {result.category}
      </Badge>
      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
