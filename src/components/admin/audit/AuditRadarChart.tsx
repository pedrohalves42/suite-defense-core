import { useMemo } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditResult, DIMENSION_LABELS } from '@/hooks/useSystemAudit';

interface AuditRadarChartProps {
  audit: AuditResult;
  previousAudit?: AuditResult | null;
}

export function AuditRadarChart({ audit, previousAudit }: AuditRadarChartProps) {
  const chartData = useMemo(() => {
    const dimensions = Object.entries(audit.dimensions);
    
    return dimensions.map(([key, value]) => ({
      dimension: DIMENSION_LABELS[key]?.name || key,
      fullKey: key,
      score: value.score,
      previousScore: previousAudit?.dimensions[key as keyof typeof previousAudit.dimensions]?.score,
      fullMark: 10,
    }));
  }, [audit, previousAudit]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>Radar de Dimensões</span>
          <span className="text-sm font-normal text-muted-foreground">
            Score Geral: {audit.overall_score}/100
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis 
                dataKey="dimension" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                className="text-xs"
              />
              <PolarRadiusAxis 
                angle={30} 
                domain={[0, 10]} 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              {previousAudit && (
                <Radar
                  name="Auditoria Anterior"
                  dataKey="previousScore"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted))"
                  fillOpacity={0.3}
                  strokeDasharray="5 5"
                />
              )}
              <Radar
                name="Auditoria Atual"
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.4}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
              />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
