import { useState, useMemo, memo } from "react";
import { Search, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBrazilDateTime } from "@/lib/date-utils";
import { CSVExportButton } from "@/components/dashboard/CSVExportButton";
import type { DashboardReport } from "@/hooks/useDashboardData";

interface ReportsTabProps {
  reports: DashboardReport[];
  loading: boolean;
}

function ReportsTabComponent({ reports, loading }: ReportsTabProps) {
  const [search, setSearch] = useState("");

  const filteredReports = useMemo(() => {
    if (!search) return reports;
    const q = search.toLowerCase();
    return reports.filter(r =>
      r.agent_name.toLowerCase().includes(q) ||
      r.kind.toLowerCase().includes(q) ||
      r.file_path.toLowerCase().includes(q)
    );
  }, [reports, search]);

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle>Relatórios Recebidos</CardTitle>
        <CardDescription>Relatórios de segurança enviados pelos computadores</CardDescription>
        {reports.length > 0 && (
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 mt-1 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por agente, tipo ou caminho..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 mt-1 -translate-y-1/2">
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
              <div className="space-y-2"><div className="flex gap-2"><Skeleton className="h-4 w-20 rounded-full" /><Skeleton className="h-4 w-28" /></div><Skeleton className="h-3 w-48" /></div>
              <Skeleton className="h-3 w-24" />
            </div>
          ))}</div>
        ) : filteredReports.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {search ? "Nenhum resultado encontrado" : "Nenhum relatório encontrado"}
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredReports.map((report) => (
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

export default memo(ReportsTabComponent);
