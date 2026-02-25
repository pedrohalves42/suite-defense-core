import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { Search, FileText } from "lucide-react";
import { formatRelativeTime } from '@/lib/date-utils';
import { useDebounce } from "@/hooks/useDebounce";

export default function TenantLogs() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterSuccess, setFilterSuccess] = useState<string>("all");
  const [pageSize, setPageSize] = useState<number>(50);
  const debouncedSearch = useDebounce(searchTerm, 500);

  // Fetch audit logs for tenant
  // ADR-FINAL-002: Fetch profile names separately from profiles_public view
  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["tenant-audit-logs", tenant?.id, debouncedSearch, filterAction, filterSuccess, pageSize],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // Fetch logs without JOIN
      let query = supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("created_at", { ascending: false })
        .limit(pageSize);

      if (filterAction && filterAction !== "all") {
        query = query.eq("action", filterAction);
      }

      if (filterSuccess !== "all") {
        query = query.eq("success", filterSuccess === "success");
      }

      if (debouncedSearch) {
        query = query.or(
          `action.ilike.%${debouncedSearch}%,resource_type.ilike.%${debouncedSearch}%`
        );
      }

      const { data: logs, error } = await query;
      if (error) throw error;
      if (!logs || logs.length === 0) return [];

      // Fetch profile names from profiles_public view
      const actorIds = [...new Set(logs.map(l => l.actor_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('user_id, full_name')
        .in('user_id', actorIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      
      // Attach profile names to logs
      return logs.map(log => ({
        ...log,
        profiles: log.actor_id ? { full_name: profileMap.get(log.actor_id) || null } : null
      }));
    },
    // V-FIX: Guard with !tenantLoading to prevent queries before JWT sync completes
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });

  if (tenantLoading || isLoading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Logs de Auditoria</h1>
        <p className="text-muted-foreground">
          Historico completo de acoes realizadas no seu tenant
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Pesquise e filtre logs de auditoria</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar acoes, recursos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por acao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as acoes</SelectItem>
                <SelectItem value="create">Criar</SelectItem>
                <SelectItem value="update">Atualizar</SelectItem>
                <SelectItem value="delete">Excluir</SelectItem>
                <SelectItem value="update_role">Alterar Funcao</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
                <SelectItem value="cleanup_agent">Limpar Agente</SelectItem>
                <SelectItem value="execute_solution">Executar Solucao</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSuccess} onValueChange={setFilterSuccess}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="failed">Falha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-between items-center pt-2">
            <div className="text-sm text-muted-foreground">
              Exibindo {auditLogs?.length || 0} de ate {pageSize} logs recentes
            </div>
            <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 logs</SelectItem>
                <SelectItem value="100">100 logs</SelectItem>
                <SelectItem value="200">200 logs</SelectItem>
                <SelectItem value="500">500 logs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Logs de Auditoria</CardTitle>
          </div>
          <CardDescription>
            {auditLogs?.length || 0} eventos registrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Acao</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs && auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.profiles?.full_name || "Sistema"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {log.resource_type}
                        {log.resource_id && (
                          <span className="ml-1 text-muted-foreground">
                            (#{log.resource_id.substring(0, 8)})
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.success ? (
                        <Badge variant="default" className="bg-green-500">
                          Sucesso
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Falha</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {log.details ? JSON.stringify(log.details).substring(0, 50) + "..." : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(log.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum log encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
