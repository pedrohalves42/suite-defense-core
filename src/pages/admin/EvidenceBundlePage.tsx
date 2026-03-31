/**
 * Evidence Bundle Page - Dedicated admin page for audit-ready evidence export
 * Supports PDF + JSON export with cryptographic verification
 */

import { useState } from 'react';
import { useEvidenceBundles, useExportEvidenceBundle, formatBytes, BUNDLE_TYPE_LABELS, BUNDLE_TYPE_DESCRIPTIONS, ExportOptions, EvidenceBundle } from '@/hooks/useEvidenceBundle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Package, Download, Calendar as CalendarIcon, Shield,
  CheckCircle, FileText, Hash, AlertTriangle, ExternalLink,
  QrCode, FileJson, FileDown, Clock, Lock, Eye
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
// jsPDF and autoTable loaded dynamically in generatePDF() for code-splitting

const EVIDENCE_OPTIONS = [
  { key: 'securityEvents', label: 'Eventos de Segurança', icon: '🔒', description: 'Alertas, ameaças e incidentes detectados' },
  { key: 'jobs', label: 'Jobs Executados', icon: '⚙️', description: 'Tarefas de remediação, scans e coletas' },
  { key: 'signatures', label: 'Assinaturas Digitais', icon: '✍️', description: 'Execuções assinadas com ECDSA P-256' },
  { key: 'hashChain', label: 'Cadeia de Hash', icon: '🔗', description: 'Prova criptográfica de integridade' },
  { key: 'riskDecisions', label: 'Decisões de Risco', icon: '⚖️', description: 'Avaliações autônomas e classificações' },
  { key: 'playbookExecutions', label: 'Playbooks SOAR', icon: '📋', description: 'Automações de resposta executadas' },
  { key: 'auditLogs', label: 'Logs de Auditoria', icon: '📝', description: 'Trilha de auditoria imutável completa' },
] as const;

async function generatePDF(bundleData: Record<string, unknown>, result: ExportResult, logoDataUrl?: string | null) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header with logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', pageWidth / 2 - 10, 4, 20, 20);
    } catch { /* fallback below */ }
  }
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Evidence Bundle', pageWidth / 2, 28, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Pacote de Evidências Criptograficamente Verificável', pageWidth / 2, 35, { align: 'center' });

  // Separator line
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(20, 36, pageWidth - 20, 36);

  // Metadata section
  let y = 45;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Informações do Bundle', 20, y);
  y += 8;

  const metadata = (bundleData.metadata ?? {}) as Record<string, unknown>;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const metaRows = [
    ['Audit ID', result.auditId],
    ['Data de Geração', new Date().toLocaleString('pt-BR')],
    ['Período', `${metadata.periodStart ? new Date(metadata.periodStart as string).toLocaleDateString('pt-BR') : '—'} até ${metadata.periodEnd ? new Date(metadata.periodEnd as string).toLocaleDateString('pt-BR') : '—'}`],
    ['Tipo', metadata.bundleType as string || '—'],
    ['Total de Registros', String(result.recordCount)],
    ['Tamanho', formatBytes(result.sizeBytes)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Campo', 'Valor']],
    body: metaRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    margin: { left: 20, right: 20 },
  });

  y = doc.lastAutoTable.finalY + 12;

  // Integrity section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Verificação de Integridade', 20, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SHA-256 Manifest Hash:', 20, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.text(result.manifestHash, 20, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Para verificar a integridade deste bundle:', 20, y);
  y += 6;
  doc.text('1. Calcule o SHA-256 do arquivo JSON correspondente', 24, y);
  y += 5;
  doc.text('2. Compare com o hash acima — devem ser idênticos', 24, y);
  y += 5;
  doc.text('3. Qualquer divergência indica alteração após a exportação', 24, y);
  y += 12;

  // Evidence summary
  const evidence = (bundleData.evidence ?? {}) as Record<string, unknown[]>;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo das Evidências', 20, y);
  y += 8;

  const countItems = (key: string): string => String(Array.isArray(evidence[key]) ? evidence[key].length : 0);
  const summaryRows: string[][] = [];
  if (evidence.securityEvents) summaryRows.push(['Eventos de Segurança', countItems('securityEvents')]);
  if (evidence.jobs) summaryRows.push(['Jobs Executados', countItems('jobs')]);
  if (evidence.signedExecutions) summaryRows.push(['Execuções Assinadas', countItems('signedExecutions')]);
  if (evidence.hashChain) summaryRows.push(['Cadeia de Hash', evidence.hashChain ? '1 (ativa)' : '0']);
  if (evidence.riskDecisions) summaryRows.push(['Decisões de Risco', countItems('riskDecisions')]);
  if (evidence.playbookExecutions) summaryRows.push(['Execuções de Playbook', countItems('playbookExecutions')]);
  if (evidence.auditLogs) summaryRows.push(['Logs de Auditoria', countItems('auditLogs')]);

  if (summaryRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Tipo de Evidência', 'Registros']],
      body: summaryRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      styles: { fontSize: 9 },
      margin: { left: 20, right: 20 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // Footer on each page
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(128);
    doc.text(
      `CyberShield Evidence Bundle — Audit ID: ${result.auditId} — Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.setTextColor(0);
  }

  return doc;
}

interface ExportResult {
  auditId: string;
  manifestHash: string;
  verificationUrl: string;
  recordCount: number;
  sizeBytes: number;
  bundle?: Record<string, unknown>;
}

export default function EvidenceBundlePage() {
  const { data: bundles, isLoading } = useEvidenceBundles();
  const exportBundle = useExportEvidenceBundle();

  const [bundleType, setBundleType] = useState<EvidenceBundle['bundle_type']>('audit');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedEvidence, setSelectedEvidence] = useState<Record<string, boolean>>({
    securityEvents: true, jobs: true, signatures: true, hashChain: true,
    riskDecisions: true, playbookExecutions: true, auditLogs: true,
  });
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setIsExporting(true);

    try {
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
        bundle: result.bundle as Record<string, unknown> | undefined,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadJSON = () => {
    if (!exportResult?.bundle) return;
    const blob = new Blob([JSON.stringify(exportResult.bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence-bundle-${exportResult.auditId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    if (!exportResult?.bundle) return;
    const { loadLogoForPDF } = await import('@/lib/pdfLogoHelper');
    const logoDataUrl = await loadLogoForPDF();
    const doc = await generatePDF(exportResult.bundle, exportResult, logoDataUrl);
    doc.save(`evidence-bundle-${exportResult.auditId}.pdf`);
  };

  const toggleEvidence = (key: string) => {
    setSelectedEvidence(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedCount = Object.values(selectedEvidence).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Evidence Bundle
        </h2>
        <p className="text-muted-foreground mt-1">
          Exporte pacotes de evidências criptograficamente verificáveis para auditorias ISO 27001, SOC 2, LGPD
        </p>
      </div>

      {/* Export Result */}
      {exportResult && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Bundle Exportado com Sucesso</h3>
                    <p className="text-sm text-muted-foreground">
                      {exportResult.recordCount} registros · {formatBytes(exportResult.sizeBytes)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-card">
                      <p className="text-xs text-muted-foreground mb-1">Audit ID</p>
                      <p className="font-mono text-sm">{exportResult.auditId}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-card">
                      <p className="text-xs text-muted-foreground mb-1">SHA-256 Hash</p>
                      <p className="font-mono text-[10px] break-all">{exportResult.manifestHash}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={downloadJSON} variant="outline" size="sm">
                      <FileJson className="h-4 w-4 mr-2" />
                      Baixar JSON
                    </Button>
                    <Button onClick={downloadPDF} variant="outline" size="sm">
                      <FileDown className="h-4 w-4 mr-2" />
                      Baixar PDF
                    </Button>
                    {exportResult.verificationUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={exportResult.verificationUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Verificar Online
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setExportResult(null)}>
                      Novo Export
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Export Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Configuração do Bundle
              </CardTitle>
              <CardDescription>
                Selecione o tipo, período e evidências a incluir
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Bundle Type */}
              <div className="space-y-2">
                <Label>Tipo de Bundle</Label>
                <Select value={bundleType} onValueChange={(v) => setBundleType(v as EvidenceBundle['bundle_type'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BUNDLE_TYPE_LABELS) as EvidenceBundle['bundle_type'][]).map((type) => (
                      <SelectItem key={type} value={type}>
                        <div>
                          <span className="font-medium">{BUNDLE_TYPE_LABELS[type]}</span>
                          <span className="text-xs text-muted-foreground ml-2">— {BUNDLE_TYPE_DESCRIPTIONS[type]}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label>Período</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[7, 30, 90].map(days => (
                    <Button
                      key={days}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setDateRange({ from: subDays(new Date(), days), to: new Date() })}
                    >
                      Últimos {days} dias
                    </Button>
                  ))}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} —{" "}
                            {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        )
                      ) : (
                        <span className="text-muted-foreground">Selecione o período</span>
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
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Separator />

              {/* Evidence Types */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Evidências a Incluir ({selectedCount}/{EVIDENCE_OPTIONS.length})</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      const allSelected = selectedCount === EVIDENCE_OPTIONS.length;
                      const newState = Object.fromEntries(EVIDENCE_OPTIONS.map(o => [o.key, !allSelected]));
                      setSelectedEvidence(newState);
                    }}
                  >
                    {selectedCount === EVIDENCE_OPTIONS.length ? 'Desmarcar todos' : 'Selecionar todos'}
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <span>{option.icon}</span>
                          {option.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Button */}
              <Button
                onClick={handleExport}
                disabled={isExporting || !dateRange?.from || !dateRange?.to || selectedCount === 0}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />
                    Gerando Bundle...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Gerar Evidence Bundle
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Info + History */}
        <div className="space-y-6">
          {/* What's included */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Garantias do Bundle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Hash className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <span>Hash SHA-256 para verificação de integridade — qualquer alteração invalida o bundle</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <span>Trilha de auditoria imutável protegida por triggers de banco de dados</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <span>Timestamps precisos com fuso horário para conformidade legal</span>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <span>Formatos PDF (legível) + JSON (verificável programaticamente)</span>
              </div>
            </CardContent>
          </Card>

          {/* Export History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Histórico de Exports
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : bundles && bundles.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {bundles.map((bundle, idx) => (
                    <motion.div
                      key={bundle.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[10px]">
                          {BUNDLE_TYPE_LABELS[bundle.bundle_type]}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(bundle.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{bundle.audit_id.slice(0, 12)}</span>
                        <span>·</span>
                        <span>{bundle.file_count} reg</span>
                        <span>·</span>
                        <span>{formatBytes(bundle.total_size_bytes)}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-xs text-muted-foreground">Nenhum bundle exportado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
