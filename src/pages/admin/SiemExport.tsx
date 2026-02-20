import { useState } from 'react';
import { useSiemExport, type SiemFormat } from '@/hooks/useSiemExport';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Server, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { formatDistanceToNow, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FORMAT_INFO: Record<SiemFormat, { label: string; desc: string }> = {
  cef: { label: 'CEF', desc: 'Common Event Format — ArcSight, QRadar' },
  syslog: { label: 'Syslog RFC 5424', desc: 'Splunk, ELK, Graylog' },
  json: { label: 'JSON', desc: 'Formato genérico estruturado' },
};

export default function SiemExportPage() {
  const { configs, history, isLoading, exportNow, saveConfig } = useSiemExport();
  const [selectedFormat, setSelectedFormat] = useState<SiemFormat>('cef');
  const [period, setPeriod] = useState('24h');

  const getSince = () => {
    const map: Record<string, number> = { '1h': 1/24, '6h': 6/24, '24h': 1, '7d': 7, '30d': 30 };
    return subDays(new Date(), map[period] || 1).toISOString();
  };

  const handleExport = () => {
    exportNow.mutate({ format: selectedFormat, since: getSince() });
  };

  const handleEnableFormat = (format: SiemFormat) => {
    saveConfig.mutate({
      format,
      is_active: true,
      include_event_types: ['alert', 'quarantine', 'vulnerability', 'agent_state'],
      batch_size: 100,
      export_interval_minutes: 5,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Server className="h-6 w-6 text-primary" />
          Exportação SIEM
        </h1>
        <p className="text-muted-foreground mt-1">
          Exporte eventos de segurança em CEF, Syslog ou JSON
        </p>
      </div>

      {/* Export Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Exportar Agora</CardTitle>
          <CardDescription>Gere um arquivo de exportação sob demanda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Formato</label>
              <Select value={selectedFormat} onValueChange={(v) => setSelectedFormat(v as SiemFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMAT_INFO).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <span className="font-medium">{info.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">— {info.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Período</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="6h">Últimas 6 horas</SelectItem>
                  <SelectItem value="24h">Últimas 24 horas</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleExport} disabled={exportNow.isPending} className="w-full">
                {exportNow.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Exportar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configured Formats */}
      <Card>
        <CardHeader>
          <CardTitle>Formatos Configurados</CardTitle>
          <CardDescription>Ative formatos para exportação periódica automática</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(Object.entries(FORMAT_INFO) as [SiemFormat, { label: string; desc: string }][]).map(([format, info]) => {
              const config = configs.find(c => c.format === format);
              return (
                <div key={format} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">{info.label}</h3>
                    {config?.is_active ? (
                      <Badge variant="default">Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Inativo</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{info.desc}</p>
                  {config?.last_export_at && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Última: {formatDistanceToNow(new Date(config.last_export_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  )}
                  {!config?.is_active && (
                    <Button size="sm" variant="outline" onClick={() => handleEnableFormat(format)} className="w-full">
                      Ativar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Exportações</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Server className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Nenhuma exportação realizada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formato</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="secondary">{entry.format.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{entry.events_exported}</TableCell>
                    <TableCell>
                      {entry.status === 'success' ? (
                        <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                      ) : (
                        <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />{entry.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.exported_at), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
