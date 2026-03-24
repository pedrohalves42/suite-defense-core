import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Ban, Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { EnrichedActivity } from './types';

interface CategoryStat {
  name: string;
  value: number;
  color: string;
}

interface WebActivityChartsProps {
  categoryStats: CategoryStat[];
  topDomains: EnrichedActivity[];
  onExportSitePDF: (domain: string) => void;
}

export function WebActivityCharts({ categoryStats, topDomains, onExportSitePDF }: WebActivityChartsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {categoryStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {categoryStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} acessos`, 'Total']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {topDomains.length > 0 && (
        <Card className="border-l-4 border-l-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top 10 Domínios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topDomains.map((item, idx) => (
                <div key={item.domain} className="flex items-center gap-3">
                  <Badge variant="outline" className="w-8 justify-center">{idx + 1}</Badge>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.domain}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" title={`Exportar PDF de ${item.domain}`} onClick={() => onExportSitePDF(item.domain)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Badge className={item.category.color} variant="outline">{item.category.icon}</Badge>
                        {item.isBlocked && (
                          <Badge variant="destructive" className="text-xs">
                            <Ban className="h-3 w-3 mr-1" />Bloqueado
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">{item.hits} acessos</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-info to-primary transition-all"
                        style={{ width: `${(item.hits / topDomains[0].hits) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
