import { Card, CardContent } from '@/components/ui/card';
import { Shield, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CoverageSummary } from '@/hooks/useMitreCoverage';

interface Props {
  summary: CoverageSummary;
}

export function CoverageSummaryCards({ summary }: Props) {
  const overallColor = summary.overall_pct >= 75 ? 'text-green-500' :
    summary.overall_pct >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Shield className="h-3.5 w-3.5" />
            Cobertura Geral
          </div>
          <div className={`text-2xl font-bold ${overallColor}`}>
            {summary.overall_pct}%
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.ref_covered}/{summary.ref_total} técnicas
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Target className="h-3.5 w-3.5" />
            Regras Ativas
          </div>
          <div className="text-2xl font-bold">{summary.total_active_rules}</div>
          <p className="text-xs text-muted-foreground">
            {summary.total_active_rules_techniques} técnicas distintas
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Técnicas Extras
          </div>
          <div className="text-2xl font-bold text-blue-500">{summary.extra_techniques}</div>
          <p className="text-xs text-muted-foreground">
            Além da referência base
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            Lacunas
          </div>
          <div className="text-2xl font-bold text-red-500">
            {summary.ref_total - summary.ref_covered}
          </div>
          <p className="text-xs text-muted-foreground">
            Técnicas sem cobertura
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
