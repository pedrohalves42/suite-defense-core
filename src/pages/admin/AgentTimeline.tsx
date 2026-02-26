import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useAgentTimeline } from '@/hooks/useAgentTimeline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Clock, ChevronDown, Heart, Zap, Shield, FileText, Wrench, MonitorCheck, Wifi, RefreshCw, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';

// === FRIENDLY LABELS for event types ===
const EVENT_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  heartbeat: { label: '💓 Sinal de vida', description: 'O computador confirmou que está funcionando' },
  auto_repair: { label: '🔧 Reparo automático', description: 'O sistema corrigiu um problema sozinho' },
  auto_repair_telemetry: { label: '📊 Relatório de reparo', description: 'Dados sobre um reparo automático realizado' },
  job: { label: '✅ Verificação', description: 'Uma tarefa de verificação foi executada' },
  scan: { label: '🔍 Varredura', description: 'O computador foi escaneado em busca de problemas' },
  enrollment: { label: '📥 Cadastro', description: 'Computador foi cadastrado no sistema' },
  policy_applied: { label: '📋 Regra aplicada', description: 'Uma regra de segurança foi aplicada' },
  policy_violation: { label: '⚠️ Regra violada', description: 'Uma regra de segurança foi descumprida' },
  update: { label: '🔄 Atualização', description: 'O agente foi atualizado' },
  shutdown: { label: '🔴 Desligamento', description: 'O computador foi desligado' },
  startup: { label: '🟢 Inicialização', description: 'O computador foi ligado' },
  network_change: { label: '🌐 Mudança de rede', description: 'A conexão de rede mudou' },
  isolation: { label: '🔒 Quarentena', description: 'O computador foi isolado por segurança' },
  threat_detected: { label: '🚨 Ameaça detectada', description: 'Uma ameaça de segurança foi encontrada' },
  certificate_check: { label: '📜 Verificação de certificado', description: 'Certificados de segurança foram verificados' },
  disk_check: { label: '💾 Verificação de disco', description: 'O espaço em disco foi verificado' },
  process_killed: { label: '🛑 Programa encerrado', description: 'Um programa suspeito foi encerrado' },
};

function getFriendlyEventType(raw: string): { label: string; description: string } {
  const lower = raw.toLowerCase();
  if (EVENT_TYPE_LABELS[lower]) return EVENT_TYPE_LABELS[lower];
  // Try partial match
  for (const [key, val] of Object.entries(EVENT_TYPE_LABELS)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return { label: raw.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), description: 'Evento registrado pelo sistema' };
}

// Friendly key/hash display
function getFriendlyKey(key: string): string {
  if (!key) return '';
  // If it looks like a hash (long hex string), shorten it
  if (/^[a-f0-9]{32,}$/i.test(key)) return `#${key.slice(0, 8)}…`;
  return key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

const getEventIcon = (eventType: string) => {
  const lower = eventType.toLowerCase();
  if (lower.includes('heartbeat')) return Heart;
  if (lower.includes('repair')) return Wrench;
  if (lower.includes('job') || lower.includes('check')) return CheckCircle;
  if (lower.includes('scan')) return Shield;
  if (lower.includes('update')) return RefreshCw;
  if (lower.includes('network')) return Wifi;
  if (lower.includes('startup') || lower.includes('enrollment')) return MonitorCheck;
  return FileText;
};

const getEventColor = (eventType: string) => {
  const lower = eventType.toLowerCase();
  if (lower.includes('heartbeat')) return 'text-success';
  if (lower.includes('repair')) return 'text-warning';
  if (lower.includes('job') || lower.includes('check')) return 'text-primary';
  if (lower.includes('scan')) return 'text-info';
  if (lower.includes('threat') || lower.includes('violation')) return 'text-destructive';
  return 'text-muted-foreground';
};

// Extract friendly summary from event data
function getFriendlyDataSummary(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const parts: string[] = [];
  if (data.status) parts.push(`Estado: ${data.status === 'success' ? '✅ Sucesso' : data.status === 'error' ? '❌ Erro' : data.status}`);
  if (data.duration_ms) parts.push(`Duração: ${(data.duration_ms / 1000).toFixed(1)}s`);
  if (data.agent_name) parts.push(`Computador: ${data.agent_name}`);
  if (data.repaired_items) parts.push(`Itens reparados: ${data.repaired_items}`);
  if (data.issues_found !== undefined) parts.push(`Problemas encontrados: ${data.issues_found}`);
  if (data.cpu_percent) parts.push(`CPU: ${data.cpu_percent}%`);
  if (data.memory_percent) parts.push(`Memória: ${data.memory_percent}%`);
  if (data.disk_usage_percent) parts.push(`Disco: ${data.disk_usage_percent}%`);
  if (data.ip_address) parts.push(`IP: ${data.ip_address}`);
  if (data.version) parts.push(`Versão: ${data.version}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function AgentTimeline() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  
  const { data: timeline, isLoading, error } = useAgentTimeline(selectedAgent, !!selectedAgent);

  const eventTypes = Array.from(new Set(timeline?.map(e => e.event_type) || []));
  const filteredTimeline = eventTypeFilter === 'all' 
    ? timeline 
    : timeline?.filter(e => e.event_type === eventTypeFilter);

  const toggleItem = (id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AdminPageLayout
      title="Histórico do Computador"
      description="Veja tudo o que aconteceu no computador selecionado"
    >
      <div className="space-y-6">
        {/* Agent Selector */}
        <Card className="border-l-4 border-l-accent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Selecionar Computador
            </CardTitle>
            <CardDescription>Escolha um computador para ver o que aconteceu</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} />
          </CardContent>
        </Card>

        {selectedAgent && (
          <>
            {/* State Explainer */}
            <AgentStateExplainer agentId={selectedAgent} />

            {/* Filter */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filtrar por Tipo</CardTitle>
                <CardDescription className="text-xs">Escolha um tipo para ver apenas esses eventos</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    {eventTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {getFriendlyEventType(type).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Timeline */}
            {isLoading ? (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </CardContent>
              </Card>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Erro ao carregar histórico: {error instanceof Error ? error.message : 'Erro desconhecido'}
                </AlertDescription>
              </Alert>
            ) : filteredTimeline?.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nenhum evento encontrado para este computador.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3 relative">
                {/* Timeline Line */}
                <div className="absolute left-[30px] top-0 bottom-0 w-0.5 bg-border" />

                {filteredTimeline?.map((event, idx) => {
                  const EventIcon = getEventIcon(event.event_type);
                  const eventId = `${event.source_id}-${event.event_time}`;
                  const friendly = getFriendlyEventType(event.event_type);
                  const dataSummary = getFriendlyDataSummary(event.data);
                  
                  return (
                    <motion.div
                      key={eventId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                    >
                      <Collapsible
                        open={openItems.has(eventId)}
                        onOpenChange={() => toggleItem(eventId)}
                      >
                        <Card className="ml-12 border-l-4 border-l-accent relative">
                          {/* Timeline Dot */}
                          <div className="absolute -left-[62px] top-6 h-8 w-8 rounded-full bg-card border-2 border-border flex items-center justify-center">
                            <EventIcon className={`h-4 w-4 ${getEventColor(event.event_type)}`} />
                          </div>

                          <CollapsibleTrigger className="w-full">
                            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col items-start gap-1">
                                  <span className="text-sm font-medium">{friendly.label}</span>
                                  <span className="text-xs text-muted-foreground">{friendly.description}</span>
                                </div>
                                <ChevronDown className={`h-4 w-4 transition-transform shrink-0 ${openItems.has(eventId) ? 'rotate-180' : ''}`} />
                              </div>
                              {dataSummary && (
                                <p className="text-xs text-muted-foreground text-left mt-1 truncate max-w-full">
                                  {dataSummary}
                                </p>
                              )}
                              <CardDescription className="text-left text-xs mt-1">
                                {formatBrazilDateTime(event.event_time, 'full')}
                              </CardDescription>
                            </CardHeader>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              <p className="text-xs text-muted-foreground mb-2">
                                Dados técnicos (para suporte):
                              </p>
                              <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-auto max-h-64">
                                <pre>{JSON.stringify(event.data, null, 2)}</pre>
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
