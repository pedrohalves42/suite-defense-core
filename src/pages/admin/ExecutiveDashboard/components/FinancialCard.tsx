import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HandCoins, Eye, Wrench, RefreshCw, Siren, Bug, Lock, ShieldBan, Clock } from 'lucide-react';
import { ImpactRow } from './ImpactRow';
import { formatCurrency } from '@/hooks/useRiskDelta';

interface Props {
  summaryData: any;
}

export function FinancialCard({ summaryData }: Props) {
  return (
    <Card className="h-full border-success/15 bg-gradient-to-br from-success/[0.06] to-transparent backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-success" />
            Economia para a Empresa (30 dias)
          </CardTitle>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-[10px] text-success border-success/30">
                <Eye className="h-3 w-3 mr-1" />Metodologia
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <p className="font-semibold mb-1">Cálculo conservador (PMEs BR):</p>
              <ul className="space-y-0.5">
                <li>• Chamado técnico remoto evitado: R$ 45</li>
                <li>• Restauração de serviço sem visita: R$ 150</li>
                <li>• Incidente crítico contido: R$ 500</li>
                <li>• Correção de conformidade automática: R$ 60</li>
                <li>• Site perigoso bloqueado: R$ 5</li>
              </ul>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-bold text-success">{formatCurrency(summaryData?.totalCostAvoided || 0)}</div>
        <p className="text-xs text-muted-foreground -mt-1">em custos que sua empresa <strong>não precisou gastar</strong></p>
        <div className="space-y-1.5">
          {summaryData?.financialImpact && (
            <>
              <ImpactRow label="Chamados técnicos evitados" count={summaryData.actions30d.auto_repairs} value={summaryData.financialImpact.autoRepairs} icon={<Wrench className="h-3 w-3" />} unitCost="R$ 45/chamado" />
              <ImpactRow label="Downtime evitado" count={summaryData.actions30d.auto_recoveries} value={summaryData.financialImpact.autoRecoveries} icon={<RefreshCw className="h-3 w-3" />} unitCost="R$ 150/restauração" />
              <ImpactRow label="Crises de segurança evitadas" count={summaryData.actions30d.critical_prevented} value={summaryData.financialImpact.criticalPrevented} icon={<Siren className="h-3 w-3" />} unitCost="R$ 500/incidente crítico" />
              <ImpactRow label="Investigações evitadas" count={summaryData.actions30d.high_prevented} value={summaryData.financialImpact.highPrevented} icon={<Bug className="h-3 w-3" />} unitCost="R$ 200/ameaça alta" />
              <ImpactRow label="Retrabalho de compliance evitado" count={summaryData.actions30d.policy_corrections} value={summaryData.financialImpact.policyCorrections} icon={<Lock className="h-3 w-3" />} unitCost="R$ 60/correção" />
              <ImpactRow label="Sites perigosos bloqueados" count={summaryData.blockedThreats} value={summaryData.financialImpact.blockedAccess} icon={<ShieldBan className="h-3 w-3" />} unitCost="R$ 5/bloqueio" />
            </>
          )}
        </div>
        {summaryData?.hoursOfITSaved && summaryData.hoursOfITSaved > 0 ? (
          <div className="mt-3 p-2.5 rounded-xl bg-success/10 border border-success/20">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="text-muted-foreground">
                Sua equipe de TI economizou <strong className="text-success">{Math.round(summaryData.hoursOfITSaved)}h</strong> de trabalho manual este mês
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
