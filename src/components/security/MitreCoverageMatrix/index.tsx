import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMitreCoverage } from '@/hooks/useMitreCoverage';
import { CoverageBarChart } from './CoverageBarChart';
import { CoverageHeatmap } from './CoverageHeatmap';
import { CoverageSummaryCards } from './CoverageSummaryCards';
import { CoverageGaps } from './CoverageGaps';

export function MitreCoverageMatrix() {
  const { data, isLoading } = useMitreCoverage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Sem dados de cobertura MITRE disponíveis.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <CoverageSummaryCards summary={data.summary} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Cobertura por Tática
            </CardTitle>
            <CardDescription>Porcentagem de técnicas cobertas em cada tática MITRE ATT&CK</CardDescription>
          </CardHeader>
          <CardContent>
            <CoverageBarChart tactics={data.tactics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Heatmap de Cobertura
            </CardTitle>
            <CardDescription>Visão geral da cobertura — verde = coberto, amarelo = parcial, vermelho = ausente</CardDescription>
          </CardHeader>
          <CardContent>
            <CoverageHeatmap tactics={data.tactics} />
          </CardContent>
        </Card>
      </div>

      <CoverageGaps tactics={data.tactics} />
    </div>
  );
}

export default MitreCoverageMatrix;
