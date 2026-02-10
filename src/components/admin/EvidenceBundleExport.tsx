/**
 * Evidence Bundle Export - Audit-Ready Export UI
 * Fase 3: UI for exporting evidence bundles with QR verification
 */

import { useState } from 'react';
import { useEvidenceBundles, useExportEvidenceBundle, formatBytes, BUNDLE_TYPE_LABELS, BUNDLE_TYPE_DESCRIPTIONS, ExportOptions, EvidenceBundle } from '@/hooks/useEvidenceBundle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Package, Download, Calendar as CalendarIcon, Shield, 
  CheckCircle, FileText, Link2, QrCode, ExternalLink,
  Clock, Hash, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';

const EVIDENCE_OPTIONS = [
  { key: 'securityEvents', label: 'Eventos de Segurança', description: 'Alertas e incidentes detectados' },
  { key: 'jobs', label: 'Jobs Executados', description: 'Tarefas de remediação e scans' },
  { key: 'signatures', label: 'Assinaturas Digitais', description: 'Registros criptografados' },
  { key: 'hashChain', label: 'Hash Chain', description: 'Cadeia de integridade' },
  { key: 'riskDecisions', label: 'Decisões de Risco', description: 'Avaliações e classificações' },
  { key: 'playbookExecutions', label: 'Execuções de Playbook', description: 'Automações executadas' },
  { key: 'auditLogs', label: 'Logs de Auditoria', description: 'Trilha de auditoria completa' },
] as const;

export function EvidenceBundleExport() {
  const { data: bundles, isLoading } = useEvidenceBundles();
  const exportBundle = useExportEvidenceBundle();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [bundleType, setBundleType] = useState<EvidenceBundle['bundle_type']>('audit');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, boolean>>({
    securityEvents: true,
    jobs: true,
    signatures: true,
    hashChain: true,
    riskDecisions: true,
    playbookExecutions: true,
    auditLogs: true,
  });
  const [exportResult, setExportResult] = useState<{
    auditId: string;
    manifestHash: string;
    verificationUrl: string;
    recordCount: number;
    sizeBytes: number;
  } | null>(null);

  const handleExport = async () => {
    if (!dateRange?.from || !dateRange?.to) return;

    const options: ExportOptions = {
      periodStart: dateRange.from.toISOString(),
      periodEnd: dateRange.to.toISOString(),
      bundleType,
      includeOptions: selectedEvidence as EvidenceBundle['included_evidence'],
    };

    const result = await exportBundle.mutateAsync(options);
    setExportResult({
      auditId: result.auditId,
      manifestHash: result.manifestHash,
      verificationUrl: result.verificationUrl,
      recordCount: result.recordCount,
      sizeBytes: result.sizeBytes,
    });
  };

  const toggleEvidence = (key: string) => {
    setSelectedEvidence(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllEvidence = () => {
    const allSelected = Object.fromEntries(EVIDENCE_OPTIONS.map(o => [o.key, true]));
    setSelectedEvidence(allSelected);
  };

  return (
    <div className="space-y-6">
      {/* Export Button & Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full md:w-auto">
            <Package className="h-4 w-4 mr-2" />
            Exportar Evidence Bundle
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Exportar Bundle de Evidências
            </DialogTitle>
            <DialogDescription>
              Gere um pacote de evidências criptograficamente verificável para auditoria
            </DialogDescription>
          </DialogHeader>

          {exportResult ? (
            <ExportResultView 
              result={exportResult} 
              onClose={() => {
                setExportResult(null);
                setIsDialogOpen(false);
              }} 
            />
          ) : (
            <>
              {/* Bundle Type */}
              <div className="space-y-3">
                <Label>Tipo de Bundle</Label>
                <Select value={bundleType} onValueChange={(v) => setBundleType(v as EvidenceBundle['bundle_type'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BUNDLE_TYPE_LABELS) as EvidenceBundle['bundle_type'][]).map((type) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex flex-col">
                          <span>{BUNDLE_TYPE_LABELS[type]}</span>
                          <span className="text-xs text-muted-foreground">{BUNDLE_TYPE_DESCRIPTIONS[type]}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-3">
                <Label>Período</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                            {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        )
                      ) : (
                        <span>Selecione o período</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Evidence Types */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Tipos de Evidência</Label>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={selectAllEvidence}>
                    Selecionar todos
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {EVIDENCE_OPTIONS.map((option) => (
                    <div
                      key={option.key}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedEvidence[option.key] 
                          ? "border-primary/50 bg-primary/5" 
                          : "border-border hover:border-primary/30"
                      )}
                      onClick={() => toggleEvidence(option.key)}
                    >
                      <Checkbox
                        checked={selectedEvidence[option.key]}
                        onCheckedChange={() => toggleEvidence(option.key)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleExport} 
                  disabled={exportBundle.isPending || !dateRange?.from || !dateRange?.to}
                >
                  {exportBundle.isPending ? (
                    <>Gerando...</>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Gerar Bundle
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Previous Bundles List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Bundles Exportados
          </CardTitle>
          <CardDescription className="text-xs">
            Histórico de pacotes de evidências gerados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : bundles && bundles.length > 0 ? (
            <div className="space-y-3">
              {bundles.map((bundle, idx) => (
                <motion.div
                  key={bundle.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {BUNDLE_TYPE_LABELS[bundle.bundle_type]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(bundle.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {bundle.audit_id.slice(0, 8)}
                        </span>
                        <span>{bundle.file_count} arquivos</span>
                        <span>{formatBytes(bundle.total_size_bytes)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {bundle.verification_url && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a href={bundle.verification_url} target="_blank" rel="noopener noreferrer">
                            <QrCode className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {bundle.download_url && (
                        <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                          <a href={bundle.download_url} download>
                            <Download className="h-3 w-3 mr-1" />
                            Baixar
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum bundle exportado ainda</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Export Result View with QR Code
function ExportResultView({ 
  result, 
  onClose 
}: { 
  result: { auditId: string; manifestHash: string; verificationUrl: string; recordCount: number; sizeBytes: number };
  onClose: () => void;
}) {
  return (
    <div className="space-y-6 py-4">
      <div className="flex items-center justify-center">
        <div className="p-4 rounded-full bg-green-500/10">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-semibold">Bundle Exportado com Sucesso!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pacote de evidências gerado e pronto para auditoria
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-muted/30 text-center">
          <p className="text-2xl font-bold text-primary">{result.recordCount}</p>
          <p className="text-xs text-muted-foreground">Registros</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 text-center">
          <p className="text-2xl font-bold text-primary">{formatBytes(result.sizeBytes)}</p>
          <p className="text-xs text-muted-foreground">Tamanho</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="p-3 rounded-lg border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Audit ID</p>
          <p className="font-mono text-sm break-all">{result.auditId}</p>
        </div>
        <div className="p-3 rounded-lg border bg-card">
          <p className="text-xs text-muted-foreground mb-1">Manifest Hash (SHA-256)</p>
          <p className="font-mono text-xs break-all">{result.manifestHash}</p>
        </div>
      </div>

      {result.verificationUrl && (
        <div className="p-4 rounded-lg border bg-muted/20 text-center">
          <QrCode className="h-24 w-24 mx-auto mb-3 text-primary" />
          <p className="text-xs text-muted-foreground mb-2">Escaneie para verificar autenticidade</p>
          <a 
            href={result.verificationUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center justify-center gap-1"
          >
            {result.verificationUrl}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <Button onClick={onClose} className="w-full">
        Fechar
      </Button>
    </div>
  );
}
