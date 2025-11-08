import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, ExternalLink, Shield, AlertTriangle, CheckCircle2, FileSearch } from 'lucide-react';
import { format } from 'date-fns';

const ITEMS_PER_PAGE = 15;

export default function VirusScans() {
  const [page, setPage] = useState(0);
  const [agentFilter, setAgentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: scans, isLoading } = useQuery({
    queryKey: ['virus-scans', page, agentFilter, statusFilter, searchTerm, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('virus_scans')
        .select('*', { count: 'exact' })
        .order('scanned_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (agentFilter !== 'all') {
        query = query.eq('agent_name', agentFilter);
      }

      if (statusFilter === 'malicious') {
        query = query.eq('is_malicious', true);
      } else if (statusFilter === 'clean') {
        query = query.eq('is_malicious', false);
      }

      if (searchTerm) {
        query = query.or(`file_path.ilike.%${searchTerm}%,file_hash.ilike.%${searchTerm}%`);
      }

      if (startDate) {
        query = query.gte('scanned_at', new Date(startDate).toISOString());
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('scanned_at', end.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return { data, count };
    },
  });

  const { data: agents } = useQuery({
    queryKey: ['scan-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('virus_scans')
        .select('agent_name')
        .order('agent_name');
      
      if (error) throw error;
      
      // Get unique agent names
      const unique = [...new Set(data?.map(s => s.agent_name))];
      return unique;
    },
  });

  const totalPages = scans?.count ? Math.ceil(scans.count / ITEMS_PER_PAGE) : 0;

  const getStatusBadge = (ismalicious: boolean | null, positives: number | null) => {
    if (ismalicious === null) {
      return { variant: 'outline' as const, icon: FileSearch, text: 'Desconhecido' };
    }
    if (ismalicious) {
      return { variant: 'destructive' as const, icon: AlertTriangle, text: `Malicioso (${positives || 0})` };
    }
    return { variant: 'default' as const, icon: CheckCircle2, text: 'Limpo' };
  };

  const ScanDetailsDialog = ({ scan }: { scan: any }) => {
    const status = getStatusBadge(scan.is_malicious, scan.positives);
    const StatusIcon = status.icon;

    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            Detalhes
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Detalhes do Scan
            </DialogTitle>
            <DialogDescription>
              Informações completas da análise do arquivo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Status</p>
                <Badge variant={status.variant} className="mt-1">
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {status.text}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Agente</p>
                <p className="text-sm mt-1 font-mono">{scan.agent_name}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Data do Scan</p>
                <p className="text-sm mt-1">{format(new Date(scan.scanned_at), 'dd/MM/yyyy HH:mm:ss')}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Detecções</p>
                <p className="text-sm mt-1">{scan.positives || 0} / {scan.total_scans || 0}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">Caminho do Arquivo</p>
              <p className="text-sm mt-1 font-mono break-all bg-secondary p-2 rounded">{scan.file_path}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground">Hash do Arquivo</p>
              <p className="text-sm mt-1 font-mono break-all bg-secondary p-2 rounded">{scan.file_hash}</p>
            </div>

            {scan.virustotal_permalink && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">VirusTotal</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(scan.virustotal_permalink, '_blank')}
                  className="w-full"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Relatório Completo no VirusTotal
                </Button>
              </div>
            )}

            {scan.scan_result && (
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-2">Resultado Detalhado</p>
                <div className="bg-secondary p-3 rounded max-h-60 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(scan.scan_result, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Scans de Vírus</h1>
              <p className="text-muted-foreground">Resultados das análises do VirusTotal</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Refine sua busca nos resultados de scans</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Input
                  placeholder="Buscar por arquivo ou hash..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <Select value={agentFilter} onValueChange={(value) => {
                  setAgentFilter(value);
                  setPage(0);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os agentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent} value={agent}>
                        {agent}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={statusFilter} onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(0);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="malicious">Apenas Maliciosos</SelectItem>
                    <SelectItem value="clean">Apenas Limpos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="date"
                  placeholder="Data inicial"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <Input
                  type="date"
                  placeholder="Data final"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('');
                    setAgentFilter('all');
                    setStatusFilter('all');
                    setStartDate('');
                    setEndDate('');
                    setPage(0);
                  }}
                  className="w-full"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultados dos Scans</CardTitle>
            <CardDescription>
              Mostrando {scans?.data?.length || 0} de {scans?.count || 0} scans
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Carregando...</div>
            ) : scans?.data?.length === 0 ? (
              <div className="text-center py-12">
                <FileSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Nenhum scan encontrado com os filtros aplicados</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Hash</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Detecções</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans?.data?.map((scan: any) => {
                      const status = getStatusBadge(scan.is_malicious, scan.positives);
                      const StatusIcon = status.icon;
                      return (
                        <TableRow key={scan.id} className={scan.is_malicious ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-sm">
                            {format(new Date(scan.scanned_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{scan.agent_name}</TableCell>
                          <TableCell className="max-w-xs truncate text-sm" title={scan.file_path}>
                            {scan.file_path}
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-[150px] truncate" title={scan.file_hash}>
                            {scan.file_hash}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {scan.positives || 0} / {scan.total_scans || 0}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <ScanDetailsDialog scan={scan} />
                            {scan.virustotal_permalink && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(scan.virustotal_permalink, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
    </div>
  );
}
