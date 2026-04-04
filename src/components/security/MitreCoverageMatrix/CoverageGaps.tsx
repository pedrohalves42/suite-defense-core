import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import type { TacticCoverage } from '@/hooks/useMitreCoverage';

interface Props {
  tactics: TacticCoverage[];
}

const formatTactic = (name: string) =>
  name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const getSeverityBadge = (pct: number) => {
  if (pct < 25) return <Badge variant="destructive">Crítico</Badge>;
  if (pct < 50) return <Badge className="bg-orange-500 hover:bg-orange-600">Baixo</Badge>;
  return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">Parcial</Badge>;
};

export function CoverageGaps({ tactics }: Props) {
  const gaps = tactics
    .filter(t => t.coverage_pct < 75 && t.uncovered_ids && t.uncovered_ids.length > 0)
    .sort((a, b) => a.coverage_pct - b.coverage_pct);

  if (gaps.length === 0) {
    return (
      <Card className="border-green-500/50">
        <CardContent className="py-6 text-center text-green-600 font-medium">
          ✓ Todas as táticas têm cobertura ≥ 75%
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Lacunas de Cobertura
        </CardTitle>
        <CardDescription>
          Táticas com cobertura inferior a 75% — priorize as críticas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gaps.map(t => (
            <div key={t.tactic} className="p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{formatTactic(t.tactic)}</span>
                <div className="flex items-center gap-2">
                  {getSeverityBadge(t.coverage_pct)}
                  <span className="text-sm text-muted-foreground">
                    {t.coverage_pct}% ({t.covered_techniques}/{t.total_techniques})
                  </span>
                </div>
              </div>
              {t.uncovered_ids && (
                <div className="flex flex-wrap gap-1">
                  {t.uncovered_ids.map(id => (
                    <Badge key={id} variant="outline" className="text-xs font-mono">
                      {id}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
