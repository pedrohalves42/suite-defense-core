import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wrench, RefreshCw, Flame, Bug, Lock, Eye, ShieldBan } from 'lucide-react';
import { ActionRow } from './ActionRow';
import { HeartPulse } from 'lucide-react';

interface Props {
  summaryData: any;
}

export function ActionsCard({ summaryData }: Props) {
  return (
    <Card className="h-full border-info/15 bg-gradient-to-br from-info/[0.06] to-transparent backdrop-blur-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-info" />
          O que fizemos pela sua empresa (30 dias)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center p-3 rounded-xl bg-info/10 border border-info/20 shadow-sm">
                <p className="text-2xl font-bold text-info">{summaryData?.automatedActions || 0}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Problemas corrigidos<br />automaticamente</p>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <p className="font-semibold mb-1">Como é calculado:</p>
              <p>Soma de reparos automáticos ({summaryData?.actions30d.auto_repairs || 0}), restaurações de serviço ({summaryData?.actions30d.auto_recoveries || 0}) e correções de conformidade ({summaryData?.actions30d.policy_corrections || 0}) registrados nos últimos 30 dias.</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center p-3 rounded-xl bg-destructive/10 border border-destructive/20 shadow-sm">
                <p className="text-2xl font-bold text-destructive">{summaryData?.incidentsContained || 0}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Incidentes de segurança<br />contidos</p>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <p className="font-semibold mb-1">Como é calculado:</p>
              <p>Eventos detectados e neutralizados: críticos ({summaryData?.actions30d.critical_prevented || 0}), altos ({summaryData?.actions30d.high_prevented || 0}) e médios ({summaryData?.actions30d.medium_prevented || 0}).</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-center p-3 rounded-xl bg-warning/10 border border-warning/20 shadow-sm">
                <p className="text-2xl font-bold text-warning">{summaryData?.hoursOfITSaved ? Math.round(summaryData.hoursOfITSaved) : 0}h</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Horas de TI<br />economizadas</p>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <p className="font-semibold mb-1">Como é calculado:</p>
              <ul className="space-y-0.5">
                <li>• Reparo automático: 0,5h × {summaryData?.actions30d.auto_repairs || 0}</li>
                <li>• Restauração de serviço: 1h × {summaryData?.actions30d.auto_recoveries || 0}</li>
                <li>• Correção de conformidade: 0,25h × {summaryData?.actions30d.policy_corrections || 0}</li>
                <li>• Incidente crítico: 2h × {summaryData?.actions30d.critical_prevented || 0}</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Detalhamento</p>
          <ActionRow icon={<Wrench className="h-3 w-3 text-info" />} label="Problemas corrigidos automaticamente" count={summaryData?.actions30d.auto_repairs || 0} description="Falhas detectadas e resolvidas sem intervenção" tooltip="Eventos do tipo 'auto_repair' com severity ≥ warning nos últimos 30 dias" />
          <ActionRow icon={<RefreshCw className="h-3 w-3 text-success" />} label="Serviços restaurados" count={summaryData?.actions30d.auto_recoveries || 0} description="Recuperação automática sem downtime" tooltip="Eventos 'auto_recovery' com severity ≥ warning nos últimos 30 dias" />
          <ActionRow icon={<Flame className="h-3 w-3 text-destructive" />} label="Ameaças críticas neutralizadas" count={summaryData?.actions30d.critical_prevented || 0} description="Incidentes graves bloqueados pelo sistema" tooltip="Eventos 'security_event' com severity 'critical' nos últimos 30 dias" />
          <ActionRow icon={<Bug className="h-3 w-3 text-warning" />} label="Riscos de segurança contidos" count={summaryData?.actions30d.high_prevented || 0} description="Vulnerabilidades identificadas e tratadas" tooltip="Eventos 'security_event' com severity 'high' nos últimos 30 dias" />
          <ActionRow icon={<Lock className="h-3 w-3 text-accent" />} label="Políticas de segurança realinhadas" count={summaryData?.actions30d.policy_corrections || 0} description="Desvios de conformidade corrigidos" tooltip="Eventos 'policy_drift' registrados nos últimos 30 dias" />
          <ActionRow icon={<ShieldBan className="h-3 w-3 text-info" />} label="Acessos não autorizados bloqueados" count={summaryData?.blockedThreats || 0} description="Tentativas barradas nos últimos 7 dias" tooltip="Total de registros na tabela 'blocked_access_attempts' dos últimos 7 dias" />
          {(summaryData?.actions30d.auto_detections || 0) > 0 && (
            <div className="pt-1.5 mt-1.5 border-t border-border/30">
              <ActionRow icon={<Eye className="h-3 w-3 text-muted-foreground" />} label="Verificações de rotina realizadas" count={summaryData?.actions30d.auto_detections || 0} description="Monitoramento contínuo (não contabilizado como ação)" tooltip="Detecções com severity 'info'/'debug' — são checagens periódicas, não ações corretivas" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
