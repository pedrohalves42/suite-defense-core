import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAutoRemediation, type RemediationActionType } from '@/hooks/useAutoRemediation';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Zap, Shield, Flame, Bug, Lock, RefreshCw, Wifi, Usb, FileWarning, MonitorCog, Loader2 } from 'lucide-react';

const REMEDIATION_OPTIONS: {
  type: RemediationActionType;
  label: string;
  description: string;
  icon: React.ReactNode;
  severity: 'low' | 'medium' | 'high' | 'critical';
}[] = [
  { type: 'enable_firewall', label: 'Ativar Firewall', description: 'Ativa todos os perfis de firewall (Domain/Private/Public)', icon: <Shield className="h-4 w-4" />, severity: 'high' },
  { type: 'enable_antivirus', label: 'Ativar Antivírus', description: 'Reativa o Windows Defender e serviços de segurança', icon: <Bug className="h-4 w-4" />, severity: 'critical' },
  { type: 'force_windows_update', label: 'Forçar Windows Update', description: 'Executa scan e instalação de atualizações pendentes', icon: <MonitorCog className="h-4 w-4" />, severity: 'medium' },
  { type: 'kill_process', label: 'Encerrar Processo', description: 'Mata um processo suspeito por nome ou PID', icon: <Flame className="h-4 w-4" />, severity: 'high' },
  { type: 'block_usb_device', label: 'Bloquear USB', description: 'Desabilita dispositivo USB não autorizado', icon: <Usb className="h-4 w-4" />, severity: 'medium' },
  { type: 'quarantine_file', label: 'Quarentena de Arquivo', description: 'Move arquivo suspeito para quarentena', icon: <FileWarning className="h-4 w-4" />, severity: 'high' },
  { type: 'firewall_block', label: 'Bloquear IP no Firewall', description: 'Cria regra de bloqueio para IP/porta específica', icon: <Wifi className="h-4 w-4" />, severity: 'medium' },
  { type: 'restart_service', label: 'Reiniciar Serviço', description: 'Reinicia um serviço Windows', icon: <RefreshCw className="h-4 w-4" />, severity: 'low' },
  { type: 'patch_apply', label: 'Aplicar Patch CVE', description: 'Aplica patch de segurança para CVE específico', icon: <Lock className="h-4 w-4" />, severity: 'critical' },
  { type: 'suggest_patch', label: 'Sugerir Patches', description: 'Avalia e sugere patches para vulnerabilidades', icon: <Lock className="h-4 w-4" />, severity: 'low' },
];

const SEVERITY_COLORS = {
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export default function TriggerRemediationDialog() {
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedAction, setSelectedAction] = useState<RemediationActionType | ''>('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const { tenant } = useTenant();
  const { executeRemediation } = useAutoRemediation();

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-for-remediation', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      return (data || []).filter((a: any) => a.status === 'active');
    },
    enabled: !!tenant?.id && open,
  });

  const selectedOption = useMemo(
    () => REMEDIATION_OPTIONS.find(o => o.type === selectedAction),
    [selectedAction]
  );

  const handleExecute = () => {
    if (!selectedAgent || !selectedAction) return;
    executeRemediation.mutate({
      agent_id: selectedAgent,
      action_type: selectedAction,
      trigger_source: 'manual_dashboard',
      trigger_details: { initiated_by: 'admin_ui' },
      requires_approval: requiresApproval,
    });
    setOpen(false);
    setSelectedAgent('');
    setSelectedAction('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Zap className="h-4 w-4" />
          Nova Remediação
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Disparar Remediação
          </DialogTitle>
          <DialogDescription>
            Selecione o agente e a ação de remediação a ser executada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Agent Select */}
          <div className="space-y-2">
            <Label>Agente</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar agente..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      {agent.agent_name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Select */}
          <div className="space-y-2">
            <Label>Ação de Remediação</Label>
            <Select value={selectedAction} onValueChange={(v) => setSelectedAction(v as RemediationActionType)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar ação..." />
              </SelectTrigger>
              <SelectContent>
                {REMEDIATION_OPTIONS.map(opt => (
                  <SelectItem key={opt.type} value={opt.type}>
                    <span className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action details */}
          {selectedOption && (
            <div className="rounded-lg border p-3 bg-muted/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  {selectedOption.icon}
                  {selectedOption.label}
                </span>
                <Badge className={SEVERITY_COLORS[selectedOption.severity]}>
                  {selectedOption.severity}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{selectedOption.description}</p>
            </div>
          )}

          {/* Approval toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">Requer Aprovação</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se ativado, a ação aguarda aprovação antes de executar
              </p>
            </div>
            <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleExecute}
            disabled={!selectedAgent || !selectedAction || executeRemediation.isPending}
            className="gap-2"
          >
            {executeRemediation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {requiresApproval ? 'Enviar para Aprovação' : 'Executar Agora'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
