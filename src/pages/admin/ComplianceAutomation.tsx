import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import {
  Shield, FileText, CheckCircle2, AlertTriangle, Clock,
  Download, RefreshCw, Eye, ShieldCheck, Lock, Server,
  Sparkles, Save, Edit3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useSOC2EvidenceCollector, type EvidenceCollectionResult } from '@/hooks/useSOC2EvidenceCollector';
import { useSOC2ControlStatuses, useSaveControlStatus } from '@/hooks/useSOC2ControlStatus';
import { Textarea } from '@/components/ui/textarea';

// ── Framework definitions ──
interface FrameworkControl {
  id: string;
  framework: string;
  controlId: string;
  title: string;
  description: string;
  status: 'compliant' | 'partial' | 'non_compliant' | 'not_applicable';
  evidenceCount: number;
  lastChecked: Date;
  category: string;
}

const FRAMEWORKS = [
  { id: 'iso27001', name: 'ISO 27001', icon: Shield, description: 'Sistema de Gestão de Segurança da Informação' },
  { id: 'soc2', name: 'SOC 2 Type II', icon: ShieldCheck, description: 'Controles de Serviço e Organização' },
  { id: 'lgpd', name: 'LGPD', icon: Lock, description: 'Lei Geral de Proteção de Dados' },
  { id: 'nist', name: 'NIST CSF', icon: Server, description: 'Framework de Cibersegurança' },
];

const CONTROL_SETS: Record<string, Array<{ id: string; title: string; category: string; desc: string }>> = {
  iso27001: [
    { id: 'A.5.1', title: 'Políticas de Segurança da Informação', category: 'Políticas', desc: 'Diretrizes de gestão para segurança da informação' },
    { id: 'A.6.1', title: 'Organização da Segurança', category: 'Organização', desc: 'Papéis e responsabilidades definidos' },
    { id: 'A.8.1', title: 'Gestão de Ativos', category: 'Ativos', desc: 'Inventário e propriedade de ativos' },
    { id: 'A.9.1', title: 'Controle de Acesso', category: 'Acesso', desc: 'Requisitos de controle de acesso' },
    { id: 'A.10.1', title: 'Criptografia', category: 'Criptografia', desc: 'Controles criptográficos' },
    { id: 'A.12.1', title: 'Segurança nas Operações', category: 'Operações', desc: 'Procedimentos e responsabilidades operacionais' },
    { id: 'A.12.2', title: 'Proteção contra Malware', category: 'Operações', desc: 'Controles contra software malicioso' },
    { id: 'A.12.4', title: 'Registro e Monitoramento', category: 'Operações', desc: 'Logs de eventos e monitoramento' },
    { id: 'A.12.6', title: 'Gestão de Vulnerabilidades', category: 'Operações', desc: 'Gestão de vulnerabilidades técnicas' },
    { id: 'A.16.1', title: 'Gestão de Incidentes', category: 'Incidentes', desc: 'Gestão de incidentes de segurança' },
    { id: 'A.18.1', title: 'Conformidade Legal', category: 'Conformidade', desc: 'Identificação de legislação aplicável' },
  ],
  soc2: [
    { id: 'CC1.1', title: 'Integridade e Valores Éticos', category: 'Ambiente de Controle', desc: 'Compromisso com integridade' },
    { id: 'CC1.2', title: 'Supervisão do Conselho', category: 'Ambiente de Controle', desc: 'Monitoramento de riscos' },
    { id: 'CC1.3', title: 'Estrutura Organizacional', category: 'Ambiente de Controle', desc: 'RBAC e estrutura de papéis' },
    { id: 'CC1.5', title: 'Responsabilização', category: 'Ambiente de Controle', desc: 'Trilha de auditoria imutável' },
    { id: 'CC2.1', title: 'Comunicação Interna', category: 'Comunicação', desc: 'Políticas documentadas' },
    { id: 'CC3.1', title: 'Avaliação de Riscos', category: 'Risco', desc: 'Monitoramento de riscos' },
    { id: 'CC6.1', title: 'Controles de Acesso Lógico', category: 'Acesso', desc: 'RBAC + RLS no banco' },
    { id: 'CC6.2', title: 'Autenticação', category: 'Acesso', desc: 'JWT + HMAC + MFA' },
    { id: 'CC6.3', title: 'Registro/Autorização', category: 'Acesso', desc: 'Sistema de enrollment' },
    { id: 'CC7.1', title: 'Monitoramento de Infraestrutura', category: 'Monitoramento', desc: 'Logs de auditoria' },
    { id: 'CC7.2', title: 'Detecção de Anomalias', category: 'Monitoramento', desc: 'Regras de alerta + agentes' },
    { id: 'CC8.1', title: 'Gestão de Mudanças', category: 'Mudanças', desc: 'Controle de mudanças' },
  ],
  lgpd: [
    { id: 'ART-6', title: 'Bases Legais do Tratamento', category: 'Tratamento', desc: 'Hipóteses de tratamento de dados pessoais' },
    { id: 'ART-7', title: 'Consentimento', category: 'Tratamento', desc: 'Fornecimento de consentimento pelo titular' },
    { id: 'ART-18', title: 'Direitos dos Titulares', category: 'Direitos', desc: 'Confirmação de existência e acesso a dados' },
    { id: 'ART-37', title: 'Registro de Operações', category: 'Governança', desc: 'Registro das operações de tratamento' },
    { id: 'ART-41', title: 'Encarregado (DPO)', category: 'Governança', desc: 'Designação de encarregado' },
    { id: 'ART-46', title: 'Segurança e Sigilo', category: 'Segurança', desc: 'Medidas de segurança aptas a proteger dados' },
    { id: 'ART-48', title: 'Comunicação de Incidentes', category: 'Incidentes', desc: 'Comunicação à ANPD e ao titular' },
  ],
  nist: [
    { id: 'ID.AM', title: 'Gestão de Ativos', category: 'Identificar', desc: 'Dados, pessoal, dispositivos e sistemas' },
    { id: 'ID.RA', title: 'Avaliação de Riscos', category: 'Identificar', desc: 'Riscos para operações organizacionais' },
    { id: 'PR.AC', title: 'Controle de Acesso', category: 'Proteger', desc: 'Gerenciamento de identidade e acesso' },
    { id: 'PR.DS', title: 'Segurança de Dados', category: 'Proteger', desc: 'Dados em repouso e em trânsito protegidos' },
    { id: 'PR.IP', title: 'Processos de Proteção', category: 'Proteger', desc: 'Políticas e procedimentos de segurança' },
    { id: 'DE.AE', title: 'Anomalias e Eventos', category: 'Detectar', desc: 'Detecção de atividade anômala' },
    { id: 'DE.CM', title: 'Monitoramento Contínuo', category: 'Detectar', desc: 'Monitoramento de eventos de segurança' },
    { id: 'RS.RP', title: 'Planejamento de Resposta', category: 'Responder', desc: 'Plano de resposta a incidentes' },
    { id: 'RC.RP', title: 'Planejamento de Recuperação', category: 'Recuperar', desc: 'Plano de recuperação executado' },
  ],
};

// ── Helpers ──
function deriveStatusFromEvidence(
  controlId: string,
  evidenceResult: EvidenceCollectionResult | null,
): { status: FrameworkControl['status']; evidenceCount: number; notes: string } {
  if (!evidenceResult?.summary) {
    return { status: 'not_applicable', evidenceCount: 0, notes: '' };
  }

  const summary = evidenceResult.summary[controlId];
  if (!summary || summary.count === 0) {
    return { status: 'non_compliant', evidenceCount: 0, notes: 'Sem evidências coletadas.' };
  }

  const status: FrameworkControl['status'] =
    summary.strength === 'strong' ? 'compliant' :
    summary.strength === 'moderate' ? 'partial' :
    summary.strength === 'weak' ? 'partial' : 'non_compliant';

  return {
    status,
    evidenceCount: summary.count,
    notes: summary.descriptions.join('\n'),
  };
}

const statusConfig = {
  compliant: { label: 'Conforme', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
  partial: { label: 'Parcial', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: Clock },
  non_compliant: { label: 'Não Conforme', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: AlertTriangle },
  not_applicable: { label: 'N/A', color: 'bg-muted text-muted-foreground', icon: Eye },
};

// ── ControlRow component ──
function ControlRow({
  control,
  savedNotes,
  onSave,
}: {
  control: FrameworkControl & { notes: string };
  savedNotes: string | null;
  onSave: (controlId: string, status: string, notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localNotes, setLocalNotes] = useState(savedNotes ?? control.notes);
  const StatusIcon = statusConfig[control.status].icon;

  const handleSave = () => {
    onSave(control.controlId, control.status, localNotes);
    setEditing(false);
  };

  return (
    <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <StatusIcon className={cn(
            'h-5 w-5 shrink-0',
            control.status === 'compliant' && 'text-green-600',
            control.status === 'partial' && 'text-amber-600',
            control.status === 'non_compliant' && 'text-red-600',
          )} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{control.controlId}</span>
              <span className="font-medium text-sm">{control.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{control.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            {control.evidenceCount}
          </Badge>
          <Badge className={cn('text-xs', statusConfig[control.status].color)} variant="outline">
            {statusConfig[control.status].label}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditing(!editing)}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Notes area — show if has content or editing */}
      {(editing || localNotes) && (
        <div className="pl-8 space-y-1">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                rows={3}
                className="text-xs"
                placeholder="Notas de implementação..."
              />
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={handleSave} className="h-7 text-xs">
                  <Save className="h-3 w-3 mr-1" /> Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground whitespace-pre-line border-l-2 border-primary/20 pl-2">
              {localNotes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ──
export default function ComplianceAutomation() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const [activeFramework, setActiveFramework] = useState('soc2');

  // Real evidence collector
  const { collectEvidence, isCollecting, result: evidenceResult } = useSOC2EvidenceCollector();

  // Saved control statuses from DB
  const { data: savedStatuses } = useSOC2ControlStatuses();
  const saveStatus = useSaveControlStatus();

  // Basic metrics for non-SOC2 frameworks
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['compliance-metrics', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const [agentsRes, alertsRes, vulnsRes] = await Promise.all([
        supabase.rpc('get_agents_list', { p_tenant_id: tenantId, p_include_archived: false }),
        supabase.from('system_alerts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
        supabase.from('agent_vulnerability_scans').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('remediation_status', 'pending'),
      ]);
      return {
        agents: ((agentsRes.data as unknown[]) || []).length,
        alerts: alertsRes.count || 0,
        vulns: vulnsRes.count || 0,
      };
    },
    enabled: !!tenantId,
  });

  // Build controls with real evidence data for SOC2, metrics-based for others
  const buildControls = useCallback((): (FrameworkControl & { notes: string })[] => {
    const controlDefs = CONTROL_SETS[activeFramework] || [];

    return controlDefs.map((ctrl) => {
      // For SOC2 with real evidence
      if (activeFramework === 'soc2' && evidenceResult) {
        const derived = deriveStatusFromEvidence(ctrl.id, evidenceResult);
        // Prefer saved notes over auto-generated
        const saved = savedStatuses?.[ctrl.id];
        return {
          id: `${activeFramework}-${ctrl.id}`,
          framework: activeFramework,
          controlId: ctrl.id,
          title: ctrl.title,
          description: ctrl.desc,
          status: saved ? (saved.status as FrameworkControl['status']) : derived.status,
          evidenceCount: derived.evidenceCount,
          lastChecked: evidenceResult?.timestamp ? new Date(evidenceResult.timestamp) : new Date(),
          category: ctrl.category,
          notes: saved?.notes ?? derived.notes,
        };
      }

      // For non-SOC2: metrics-based (deterministic, no Math.random)
      let status: FrameworkControl['status'] = 'compliant';
      const m = metrics ?? { agents: 0, alerts: 0, vulns: 0 };

      if (ctrl.category === 'Operações' || ctrl.category === 'Monitoramento' || ctrl.category === 'Detectar') {
        status = m.agents > 0 ? (m.alerts > 5 ? 'partial' : 'compliant') : 'non_compliant';
      } else if (ctrl.id.includes('Vuln') || ctrl.id === 'A.12.6') {
        status = m.vulns > 10 ? 'non_compliant' : m.vulns > 3 ? 'partial' : 'compliant';
      }

      return {
        id: `${activeFramework}-${ctrl.id}`,
        framework: activeFramework,
        controlId: ctrl.id,
        title: ctrl.title,
        description: ctrl.desc,
        status,
        evidenceCount: 0,
        lastChecked: new Date(),
        category: ctrl.category,
        notes: '',
      };
    });
  }, [activeFramework, evidenceResult, savedStatuses, metrics]);

  const controls = buildControls();
  const compliantCount = controls.filter(c => c.status === 'compliant').length;
  const partialCount = controls.filter(c => c.status === 'partial').length;
  const nonCompliantCount = controls.filter(c => c.status === 'non_compliant').length;
  const totalControls = controls.length;
  const complianceScore = totalControls > 0
    ? Math.round(((compliantCount + partialCount * 0.5) / totalControls) * 100)
    : 0;

  const handleAutoFill = async () => {
    const result = await collectEvidence(true);
    if (result?.success) {
      // Auto-save all control statuses
      for (const item of result.evidence) {
        const summary = result.summary[item.control_id];
        if (summary) {
          const status =
            summary.strength === 'strong' ? 'implemented' :
            summary.strength === 'moderate' ? 'in_progress' : 'not_started';

          saveStatus.mutate({
            controlId: item.control_id,
            status,
            notes: summary.descriptions.join('\n'),
            autoFilled: true,
          });
        }
      }
      toast.success('Controles preenchidos automaticamente com dados reais do sistema');
    }
  };

  const handleSaveControl = (controlId: string, status: string, notes: string) => {
    saveStatus.mutate({ controlId, status, notes });
    toast.success(`Controle ${controlId} salvo`);
  };

  const activeFrameworkData = FRAMEWORKS.find(f => f.id === activeFramework)!;
  const FrameworkIcon = activeFrameworkData.icon;

  if (isLoading) {
    return (
      <AdminPageLayout title="Conformidade Automática" description="Mapeamento automático de frameworks">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Conformidade Automática"
      description="Mapeamento automático ISO 27001, SOC 2, LGPD e NIST CSF"
    >
      <div className="space-y-6">
        {/* Framework Selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FRAMEWORKS.map((fw) => {
            const Icon = fw.icon;
            const isActive = activeFramework === fw.id;
            return (
              <Card
                key={fw.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  isActive && 'ring-2 ring-primary border-primary'
                )}
                onClick={() => setActiveFramework(fw.id)}
              >
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    <span className={cn('font-semibold text-sm', isActive && 'text-primary')}>{fw.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{fw.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Score Overview */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex items-center gap-4 flex-1">
                <div className={cn(
                  'h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold',
                  complianceScore >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                  complianceScore >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                )}>
                  {complianceScore}%
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{activeFrameworkData.name}</h3>
                  <p className="text-sm text-muted-foreground">{activeFrameworkData.description}</p>
                  <div className="flex gap-3 mt-2">
                    <span className="text-xs"><span className="font-medium text-green-600">{compliantCount}</span> conformes</span>
                    <span className="text-xs"><span className="font-medium text-amber-600">{partialCount}</span> parciais</span>
                    <span className="text-xs"><span className="font-medium text-red-600">{nonCompliantCount}</span> não conformes</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {activeFramework === 'soc2' && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleAutoFill}
                    disabled={isCollecting}
                  >
                    {isCollecting ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Auto-preencher
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  Gerar Relatório
                </Button>
              </div>
            </div>
            <Progress value={complianceScore} className="mt-4 h-2" />
          </CardContent>
        </Card>

        {/* Evidence collection result banner */}
        {evidenceResult && activeFramework === 'soc2' && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>
                  Última coleta: <strong>{evidenceResult.evidence.length}</strong> evidências em{' '}
                  <strong>{evidenceResult.controls.length}</strong> controles
                  {evidenceResult.saved && ' • Salvo no banco'}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(evidenceResult.timestamp).toLocaleString('pt-BR')}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Controls List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FrameworkIcon className="h-5 w-5" />
              Controles - {activeFrameworkData.name}
            </CardTitle>
            <CardDescription>
              {totalControls} controles mapeados
              {activeFramework === 'soc2' && evidenceResult
                ? ' • Dados reais do sistema'
                : activeFramework === 'soc2'
                ? ' • Clique em "Auto-preencher" para coletar evidências'
                : ' automaticamente'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {controls.map((control) => (
                <ControlRow
                  key={control.id}
                  control={control}
                  savedNotes={savedStatuses?.[control.controlId]?.notes ?? null}
                  onSave={handleSaveControl}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
