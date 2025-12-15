import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, History, Search, Filter, CheckCircle, XCircle } from 'lucide-react';
import { formatBrazilDateTime, TIMEZONE_INDICATOR } from '@/lib/date-utils';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { motion } from 'framer-motion';

const ITEMS_PER_PAGE = 20;

// Tradução de ações para português amigável
const actionLabels: Record<string, string> = {
  'agent_enrolled': 'Computador Cadastrado',
  'agent_enrollment_failed': 'Falha no Cadastro',
  'job_created': 'Tarefa Criada',
  'job_creation_denied': 'Tarefa Negada',
  'login': 'Login Realizado',
  'logout': 'Logout',
  'update_role': 'Permissão Alterada',
  'create': 'Criação',
  'update': 'Atualização',
  'delete': 'Exclusão',
  'cleanup_agent': 'Limpeza de Computador',
};

const resourceLabels: Record<string, string> = {
  'agent': 'Computador',
  'user': 'Usuário',
  'job': 'Tarefa',
  'enrollment_key': 'Chave de Instalação',
  'security_event': 'Evento de Segurança',
  'report': 'Relatório',
};

export default function AuditLogs() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  
  const searchTerm = useDebounce(searchInput, 500);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', page, actionFilter, userFilter, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*, actor:profiles!audit_logs_actor_id_fkey(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (userFilter && userFilter !== 'all') {
        query = query.eq('actor_id', userFilter);
      }

      if (searchTerm) {
        query = query.or(`action.ilike.%${searchTerm}%,resource_type.ilike.%${searchTerm}%`);
      }

      const { data: logsData, error, count } = await query;
      if (error) throw error;

      return { data: logsData, count };
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

  const getActionLabel = (action: string) => actionLabels[action] || action;
  const getResourceLabel = (resource: string) => resourceLabels[resource] || resource;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <History className="h-8 w-8" />
          Histórico de Atividades
        </h2>
        <p className="text-muted-foreground flex items-center gap-1">
          Registro de todas as ações realizadas no sistema
          <HelpTooltip term="auditoria" />
        </p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
            <CardDescription>Refine sua busca no histórico de atividades</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por ação ou recurso..."
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setPage(0);
                  }}
                  className="pl-10"
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
                    <SelectItem value="agent_enrolled">Computador Cadastrado</SelectItem>
                    <SelectItem value="agent_enrollment_failed">Falha no Cadastro</SelectItem>
                    <SelectItem value="job_created">Tarefa Criada</SelectItem>
                    <SelectItem value="job_creation_denied">Tarefa Negada</SelectItem>
                    <SelectItem value="update_role">Permissão Alterada</SelectItem>
                    <SelectItem value="cleanup_agent">Limpeza de Computador</SelectItem>
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
                        {user.full_name || 'Usuário sem nome'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Registros
            </CardTitle>
            <CardDescription>
              Mostrando {logs?.data?.length || 0} de {logs?.count || 0} atividades
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 animate-spin mx-auto mb-2" />
                Carregando histórico...
              </div>
            ) : logs?.data?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-2 opacity-20" />
                Nenhuma atividade encontrada com os filtros selecionados.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora {TIMEZONE_INDICATOR}</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>O que foi alterado</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs?.data?.map((log: any) => (
                      <TableRow key={log.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm font-mono">
                          {formatBrazilDateTime(log.created_at, 'full')}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.actor?.full_name || 'Sistema Automático'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {getActionLabel(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{getResourceLabel(log.resource_type)}</div>
                            {log.resource_id && (
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={log.resource_id}>
                                ID: {log.resource_id.substring(0, 8)}...
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="default" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Sucesso
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Falha
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
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
                      className="gap-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
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
                      className="gap-2"
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
