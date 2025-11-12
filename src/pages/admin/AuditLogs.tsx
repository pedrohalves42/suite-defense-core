import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

const ITEMS_PER_PAGE = 20;

export default function AuditLogs() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all'); // CORREÇÃO: Iniciar com 'all' para evitar uncontrolled
  const [searchTerm, setSearchTerm] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, userFilter, searchTerm],
    queryFn: async () => {
      // CORREÇÃO: Buscar logs sem join complexo (evita erro 400)
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (userFilter && userFilter !== 'all') {
        query = query.eq('user_id', userFilter);
      }

      if (searchTerm) {
        query = query.or(`action.ilike.%${searchTerm}%,resource_type.ilike.%${searchTerm}%`);
      }

      const { data: logsData, error, count } = await query;
      if (error) throw error;

      // CORREÇÃO: Buscar profiles separadamente para evitar problemas de join
      const userIds = [...new Set(
        logsData?.map(log => log.user_id).filter(Boolean) || []
      )];

      if (userIds.length === 0) {
        return { data: logsData?.map(log => ({ ...log, profiles: null })), count };
      }

      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      // CORREÇÃO: Merge profiles com logs
      const profilesMap = new Map(
        profilesData?.map(p => [p.user_id, p]) || []
      );

      const enrichedLogs = logsData?.map(log => ({
        ...log,
        profiles: log.user_id ? profilesMap.get(log.user_id) : null
      }));

      return { data: enrichedLogs, count };
    },
  });

  const { data: users } = useQuery({
    queryKey: ['audit-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      if (error) throw error;
      return data;
    },
  });

  const totalPages = logs?.count ? Math.ceil(logs.count / ITEMS_PER_PAGE) : 0;

  const getActionBadgeVariant = (success: boolean) => {
    return success ? 'default' : 'destructive';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Logs de Auditoria</h2>
        <p className="text-muted-foreground">Histórico de todas as ações realizadas no sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Refine sua busca nos logs de auditoria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                placeholder="Buscar por ação ou recurso..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div>
              <Select value={actionFilter} onValueChange={(value) => {
                setActionFilter(value);
                setPage(0);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as ações" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="agent_enrolled">Agente Registrado</SelectItem>
                  <SelectItem value="agent_enrollment_failed">Falha no Registro</SelectItem>
                  <SelectItem value="job_created">Job Criado</SelectItem>
                  <SelectItem value="job_creation_denied">Job Negado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={userFilter} onValueChange={(value) => {
                setUserFilter(value);
                setPage(0);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os usuários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {users?.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name || user.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Mostrando {logs?.data?.length || 0} de {logs?.count || 0} registros
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs?.data?.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                      </TableCell>
                      <TableCell>{log.profiles?.full_name || 'Sistema'}</TableCell>
                      <TableCell className="font-mono text-xs">{log.action}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{log.resource_type}</div>
                          {log.resource_id && (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {log.resource_id}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.success)}>
                          {log.success ? 'Sucesso' : 'Falha'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.ip_address || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {page + 1} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
