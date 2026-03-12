import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBrazilDateTime } from "@/lib/date-utils";
import type { DashboardReport } from "@/hooks/useDashboardData";

interface ReportsTabProps {
  reports: DashboardReport[];
  loading: boolean;
}

export default function ReportsTab({ reports, loading }: ReportsTabProps) {
  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle>Relatórios Recebidos</CardTitle>
        <CardDescription>Relatórios de segurança enviados pelos computadores</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : reports.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum relatório encontrado</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {reports.map((report) => (
              <div key={report.id} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{report.kind}</Badge>
                    <span className="text-sm font-mono text-foreground">{report.agent_name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{report.file_path}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatBrazilDateTime(report.created_at, 'short')}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
