import { useState } from 'react';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { AgentSelector } from '@/components/AgentSelector';
import { useAgentTimeline } from '@/hooks/useAgentTimeline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertCircle, Clock, Heart, Shield, RefreshCw, Wifi,
  MonitorCheck, Wrench, CheckCircle, FileText, Ban, Lock, HardDrive, Bug
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentStateExplainer } from '@/components/agent/AgentStateExplainer';

// ─── Friendly mapping ────────────────────────────────────────────
interface EventMeta {
  icon: typeof Heart;
  color: string;       // tailwind text color token
  dot: string;         // tailwind bg color token for the dot
  label: string;
  summary: (data: Record<string, unknown>) => string;
}

const fallbackSummary = () => '';

// ─── Human-friendly alert_type labels ────────────────────────────
const ALERT_TYPE_LABELS: Record<string, string> = {
  firewall_disabled: '🔥 Firewall desativado',
  antivirus_inactive: '🛡️ Antivírus inativo',
  unauthorized_usb: '🔌 USB não autorizado detectado',
  malware_detected: '🦠 Malware detectado',
  suspicious_process: '⚠️ Processo suspeito',
  service_stopped: '⛔ Serviço parado',
  policy_violation: '📋 Violação de política',
  brute_force: '🔐 Tentativa de força bruta',
  network_anomaly: '🌐 Anomalia de rede',
  privilege_escalation: '⬆️ Escalada de privilégio',
  ransomware_detected: '🔒 Ransomware detectado',
  data_exfiltration: '📤 Exfiltração de dados',
  login_failed: '🚫 Login falhou',
  unauthorized_access: '🚷 Acesso não autorizado',
};

function securityEventSummary(data: Record<string, unknown> | undefined): string {
  if (!data) return '';

  const alertType = data.alert_type as string | undefined;
  const alertMessage = data.alert_message as string | undefined;
  const severity = data.severity as string | undefined;
  const details = data.details as any | undefined;

  // Build a human-readable summary from the data
  const parts: string[] = [];

  if (alertType && ALERT_TYPE_LABELS[alertType]) {
    parts.push(ALERT_TYPE_LABELS[alertType]);
  } else if (alertType) {
    parts.push(alertType.replace(/_/g, ' '));
  }

  // Add specific detail context
  if (alertType === 'unauthorized_usb' && details?.model) {
    parts.push(`— ${details.model}`);
  } else if (alertType === 'firewall_disabled' && details?.disabled_profiles) {
    const profiles = Array.isArray(details.disabled_profiles)
      ? (details.disabled_profiles as string[]).join(', ')
      : String(details.disabled_profiles);
    parts.push(`(${profiles})`);
  } else if (alertType === 'antivirus_inactive' && details?.detection_method) {
    parts.push('— nenhum antivírus encontrado');
  } else if (alertMessage && !parts.length) {
    // Truncate long messages
    parts.push(alertMessage.length > 80 ? alertMessage.substring(0, 77) + '…' : alertMessage);
  }

  if (severity === 'critical') {
    parts.push('• Crítico');
  } else if (severity === 'warning') {
    parts.push('• Atenção');
  }

  return parts.join(' ');
}

function forceUpdateSummary(data: Record<string, unknown> | undefined): string {
  if (!data) return 'Atualização forçada';
  const oldV = data.old_version as string | undefined;
  const newV = data.new_version as string | undefined;
  if (oldV && newV && oldV !== newV) return `${oldV} → ${newV}`;
  if (newV) return `Versão ${newV} reinstalada`;
  return 'Atualização forçada aplicada';
}

function stateChangeSummary(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  const from = data.old_status || data.from_state;
  const to = data.new_status || data.to_state;
  if (from && to) return `${from} → ${to}`;
  return '';
}

const EVENT_MAP: Record<string, EventMeta> = {
  heartbeat:             { icon: Heart,        color: 'text-success',        dot: 'bg-success',        label: 'Sinal de vida',           summary: fallbackSummary },
  auto_repair:           { icon: Wrench,       color: 'text-warning',        dot: 'bg-warning',        label: 'Reparo automático',       summary: (d) => d?.repaired_items ? `${d.repaired_items} itens corrigidos` : d?.action ? String(d.action).replace(/_/g, ' ') : 'Problema corrigido automaticamente' },
  auto_repair_telemetry: { icon: Wrench,       color: 'text-warning',        dot: 'bg-warning',        label: 'Reparo automático',       summary: fallbackSummary },
  auto_recovery:         { icon: RefreshCw,    color: 'text-info',           dot: 'bg-info',           label: 'Recuperação automática',  summary: (d) => d?.service_name ? `Serviço "${d.service_name}" restaurado` : 'Serviço restaurado' },
  job:                   { icon: CheckCircle,  color: 'text-primary',        dot: 'bg-primary',        label: 'Tarefa executada',        summary: (d) => d?.status === 'success' ? 'Concluída com sucesso' : d?.status === 'error' ? 'Falhou' : '' },
  scan:                  { icon: Shield,       color: 'text-info',           dot: 'bg-info',           label: 'Varredura de segurança',  summary: (d) => d?.issues_found !== undefined ? `${d.issues_found} problema(s) encontrado(s)` : '' },
  enrollment:            { icon: MonitorCheck, color: 'text-success',        dot: 'bg-success',        label: 'Computador cadastrado',   summary: fallbackSummary },
  policy_applied:        { icon: Shield,       color: 'text-primary',        dot: 'bg-primary',        label: 'Regra aplicada',          summary: fallbackSummary },
  policy_violation:      { icon: AlertCircle,  color: 'text-destructive',    dot: 'bg-destructive',    label: 'Regra violada',           summary: fallbackSummary },
  policy_sync:           { icon: RefreshCw,    color: 'text-primary',        dot: 'bg-primary',        label: 'Políticas sincronizadas', summary: (d) => d?.policies_count ? `${d.policies_count} política(s)` : '' },
  policy_drift:          { icon: AlertCircle,  color: 'text-warning',        dot: 'bg-warning',        label: 'Desvio de política',      summary: (d) => d?.drift_type ? String(d.drift_type).replace(/_/g, ' ') : '' },
  update:                { icon: RefreshCw,    color: 'text-info',           dot: 'bg-info',           label: 'Atualização',             summary: (d) => d?.version ? `Atualizado para ${d.version}` : 'Agente atualizado' },
  force_update_applied:  { icon: RefreshCw,    color: 'text-info',           dot: 'bg-info',           label: 'Atualização forçada',     summary: forceUpdateSummary },
  force_update_staged:   { icon: RefreshCw,    color: 'text-muted-foreground', dot: 'bg-muted-foreground', label: 'Atualização preparada', summary: (d) => d?.new_version ? `Versão ${d.new_version} pronta` : '' },
  state_change:          { icon: RefreshCw,    color: 'text-warning',        dot: 'bg-warning',        label: 'Estado alterado',         summary: stateChangeSummary },
  shutdown:              { icon: Ban,          color: 'text-muted-foreground', dot: 'bg-muted-foreground', label: 'Desligado',           summary: fallbackSummary },
  startup:               { icon: MonitorCheck, color: 'text-success',        dot: 'bg-success',        label: 'Ligado',                  summary: fallbackSummary },
  network_change:        { icon: Wifi,         color: 'text-warning',        dot: 'bg-warning',        label: 'Rede alterada',           summary: (d) => d?.ip_address ? `Novo IP: ${d.ip_address}` : '' },
  isolation:             { icon: Lock,         color: 'text-destructive',    dot: 'bg-destructive',    label: 'Isolado por segurança',   summary: fallbackSummary },
  threat_detected:       { icon: Bug,          color: 'text-destructive',    dot: 'bg-destructive',    label: 'Ameaça detectada',        summary: (d) => d?.threat_name ? String(d.threat_name) : '' },
  certificate_check:     { icon: Shield,       color: 'text-primary',        dot: 'bg-primary',        label: 'Certificados verificados', summary: fallbackSummary },
  disk_check:            { icon: HardDrive,    color: 'text-primary',        dot: 'bg-primary',        label: 'Disco verificado',        summary: (d) => d?.disk_usage_percent ? `${d.disk_usage_percent}% em uso` : '' },
  process_killed:        { icon: Ban,          color: 'text-destructive',    dot: 'bg-destructive',    label: 'Programa suspeito encerrado', summary: (d) => d?.process_name ? String(d.process_name) : '' },
  decision:              { icon: Shield,       color: 'text-warning',        dot: 'bg-warning',        label: 'Ação de segurança',       summary: (d) => d?.rule_name ? d.rule_name.replace(/_/g, ' ') : '' },
  security_event:        { icon: Shield,       color: 'text-warning',        dot: 'bg-warning',        label: 'Alerta de segurança',     summary: securityEventSummary },
};

function getEventMeta(eventType: string): EventMeta {
  const lower = eventType.toLowerCase();
  if (EVENT_MAP[lower]) return EVENT_MAP[lower];
  for (const [key, val] of Object.entries(EVENT_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return { icon: FileText, color: 'text-muted-foreground', dot: 'bg-muted-foreground', label: eventType.replace(/_/g, ' '), summary: fallbackSummary };
}

// ─── Relative time ───────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR');
}

// ─── Filter categories ──────────────────────────────────────────
const FILTER_CATEGORIES: { value: string; label: string; match: string[] }[] = [
  { value: 'all', label: '🗂️ Todos os eventos', match: [] },
  { value: 'security', label: '🛡️ Segurança', match: ['threat', 'violation', 'isolation', 'scan', 'decision', 'security', 'process_killed'] },
  { value: 'updates', label: '🔄 Atualizações', match: ['update'] },
  { value: 'health', label: '💓 Saúde', match: ['heartbeat', 'repair', 'startup', 'shutdown', 'disk_check'] },
  { value: 'tasks', label: '✅ Tarefas', match: ['job', 'check', 'certificate', 'policy'] },
  { value: 'network', label: '🌐 Rede', match: ['network'] },
];

function matchesCategory(eventType: string, category: string): boolean {
  if (category === 'all') return true;
  const cat = FILTER_CATEGORIES.find(c => c.value === category);
  if (!cat) return true;
  const lower = eventType.toLowerCase();
  return cat.match.some(m => lower.includes(m));
}

// ─── Component ──────────────────────────────────────────────────
export default function AgentTimeline() {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [category, setCategory] = useState('all');

  const { data: timeline, isLoading, error } = useAgentTimeline(selectedAgent, !!selectedAgent);

  const filtered = timeline?.filter(e => matchesCategory(e.event_type, category)) || [];

  return (
    <AdminPageLayout
      title="Histórico do Computador"
      description="Veja o que aconteceu no computador selecionado"
    >
      <div className="space-y-5 max-w-2xl">
        {/* Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Selecionar Computador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentSelector value={selectedAgent} onValueChange={setSelectedAgent} />
          </CardContent>
        </Card>

        {selectedAgent && (
          <>
            {/* State */}
            <AgentStateExplainer agentId={selectedAgent} />

            {/* Category filter — inline */}
            <div className="flex flex-wrap gap-2">
              {FILTER_CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                    ${category === cat.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
                    }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Timeline */}
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Erro ao carregar histórico.</AlertDescription>
              </Alert>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhum evento encontrado.
              </div>
            ) : (
              <div className="relative pl-8">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

                <div className="space-y-1">
                  {filtered.map((event, idx) => {
                    const meta = getEventMeta(event.event_type);
                    const Icon = meta.icon;
                    const summary = meta.summary(event.data);

                    return (
                      <motion.div
                        key={`${event.source_id}-${event.event_time}-${idx}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                        className="relative flex items-start gap-3 py-2.5 group"
                      >
                        {/* Dot */}
                        <div className={`absolute -left-8 top-3 h-[22px] w-[22px] rounded-full border-2 border-background flex items-center justify-center ${meta.dot}`}>
                          <Icon className="h-3 w-3 text-background" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {meta.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                              {timeAgo(event.event_time)}
                            </span>
                          </div>
                          {summary && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {summary}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
