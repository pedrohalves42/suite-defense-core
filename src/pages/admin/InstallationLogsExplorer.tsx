import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useInstallationLogs } from "@/hooks/useAgentLifecycle";
import { Search, FileText, CheckCircle, XCircle, AlertTriangle, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function InstallationLogsExplorer() {
  const [filters, setFilters] = useState({
    agentName: '',
    eventType: 'all',
    success: 'all',
    platform: 'all',
    errorType: '',
    dateFrom: '',
    dateTo: '',
  });

  const { data: logs, isLoading } = useInstallationLogs({
    agentName: filters.agentName || undefined,
    eventType: filters.eventType !== 'all' ? filters.eventType : undefined,
    success: filters.success !== 'all' ? filters.success === 'true' : undefined,
    platform: filters.platform !== 'all' ? filters.platform : undefined,
    errorType: filters.errorType || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    limit: 100,
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      agentName: '',
      eventType: 'all',
      success: 'all',
      platform: 'all',
      errorType: '',
      dateFrom: '',
      dateTo: '',
    });
  };

  const getEventBadge = (eventType: string) => {
    const badges: Record<string, { label: string; variant: any }> = {
      'generated': { label: 'Gerado', variant: 'outline' },
      'downloaded': { label: 'Baixado', variant: 'secondary' },
      'command_copied': { label: 'Copiado', variant: 'default' },
      'post_installation': { label: 'Instalado', variant: 'default' },
      'post_installation_unverified': { label: 'Instalado (Não Verificado)', variant: 'secondary' },
      'failed': { label: 'Falhado', variant: 'destructive' },
    };
    return badges[eventType] || { label: eventType, variant: 'outline' };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Explorador de Logs de Instalação</h1>
        <p className="text-muted-foreground">Busca avançada e análise de logs do pipeline de instalação</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros de Busca
          </CardTitle>
          <CardDescription>Refine a busca de logs para encontrar eventos específicos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="agentName">Nome do Agente</Label>
              <Input
                id="agentName"
                placeholder="Buscar por nome..."
                value={filters.agentName}
                onChange={(e) => handleFilterChange('agentName', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventType">Tipo de Evento</Label>
              <Select value={filters.eventType} onValueChange={(v) => handleFilterChange('eventType', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="generated">Gerado</SelectItem>
                  <SelectItem value="downloaded">Baixado</SelectItem>
                  <SelectItem value="command_copied">Comando Copiado</SelectItem>
                  <SelectItem value="post_installation">Instalado</SelectItem>
                  <SelectItem value="post_installation_unverified">Instalado (Não Verificado)</SelectItem>
                  <SelectItem value="failed">Falhado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="success">Status</Label>
              <Select value={filters.success} onValueChange={(v) => handleFilterChange('success', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Sucesso</SelectItem>
                  <SelectItem value="false">Falha</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">Plataforma</Label>
              <Select value={filters.platform} onValueChange={(v) => handleFilterChange('platform', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="linux">Linux</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="errorType">Tipo de Erro</Label>
              <Input
                id="errorType"
                placeholder="401, TLS, proxy..."
                value={filters.errorType}
                onChange={(e) => handleFilterChange('errorType', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFrom">De</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateTo">Até</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={clearFilters} variant="outline">
              Limpar Filtros
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Resultados ({logs?.length || 0})</CardTitle>
          <CardDescription>Logs ordenados por data mais recente</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tempo</TableHead>
                <TableHead>Rede</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log) => {
                const eventBadge = getEventBadge(log.event_type);
                
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{log.agent_name}</TableCell>
                    <TableCell>
                      <Badge variant={eventBadge.variant}>{eventBadge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.platform}</Badge>
                    </TableCell>
                    <TableCell>
                      {log.success === true && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {log.success === false && <XCircle className="h-4 w-4 text-red-500" />}
                      {log.success === null && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                    </TableCell>
                    <TableCell>
                      {log.installation_time_seconds ? `${log.installation_time_seconds}s` : '-'}
                    </TableCell>
                    <TableCell>
                      {log.network_connectivity === true && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {log.network_connectivity === false && <XCircle className="h-4 w-4 text-red-500" />}
                      {log.network_connectivity === null && '-'}
                    </TableCell>
                    <TableCell>
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <FileText className="h-4 w-4" />
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="w-[600px] sm:max-w-[600px]">
                          <SheetHeader>
                            <SheetTitle>{log.agent_name} - Detalhes</SheetTitle>
                            <SheetDescription>
                              {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                            </SheetDescription>
                          </SheetHeader>
                          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-semibold mb-2">Informações Básicas</h4>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Evento:</span>
                                    <Badge variant={eventBadge.variant}>{eventBadge.label}</Badge>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Plataforma:</span>
                                    <span>{log.platform}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Sucesso:</span>
                                    <span>{log.success === true ? 'Sim' : log.success === false ? 'Não' : 'N/A'}</span>
                                  </div>
                                  {log.installation_time_seconds && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Tempo de Instalação:</span>
                                      <span>{log.installation_time_seconds}s</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {log.error_message && (
                                <div>
                                  <h4 className="font-semibold mb-2 text-destructive">Erro</h4>
                                  <p className="text-sm bg-destructive/10 p-3 rounded">
                                    {log.error_message}
                                  </p>
                                </div>
                              )}

                              {log.metadata && (
                                <div>
                                  <h4 className="font-semibold mb-2">Metadata</h4>
                                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
