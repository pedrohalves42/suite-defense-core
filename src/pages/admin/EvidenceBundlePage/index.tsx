import { useState } from 'react';
import { useEvidenceBundles, useExportEvidenceBundle, BUNDLE_TYPE_LABELS, BUNDLE_TYPE_DESCRIPTIONS } from '@/hooks/useEvidenceBundle';
import type { ExportOptions, EvidenceBundle } from '@/hooks/useEvidenceBundle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Package, Download, Calendar as CalendarIcon, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, ptBR } from '@/lib/date-utils';
import { subDays } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { EVIDENCE_OPTIONS, type ExportResult } from './constants';
import { ExportResultCard } from './ExportResultCard';
import { BundleHistoryPanel } from './BundleHistoryPanel';

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

  const toggleEvidence = (key: string) => {
    setSelectedEvidence(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedCount = Object.values(selectedEvidence).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          Evidence Bundle
        </h2>
        <p className="text-muted-foreground mt-1">
          Exporte pacotes de evidências criptograficamente verificáveis para auditorias ISO 27001, SOC 2, LGPD
        </p>
      </div>

      {exportResult && (
        <ExportResultCard result={exportResult} onReset={() => setExportResult(null)} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Configuração do Bundle
              </CardTitle>
              <CardDescription>Selecione o tipo, período e evidências a incluir</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Bundle Type */}
              <div className="space-y-2">
                <Label>Tipo de Bundle</Label>
                <Select value={bundleType} onValueChange={(v) => setBundleType(v as EvidenceBundle['bundle_type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <Button key={days} variant="outline" size="sm" className="text-xs"
                      onClick={() => setDateRange({ from: subDays(new Date(), days), to: new Date() })}>
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
                          <>{format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} — {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}</>
                        ) : format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                      ) : (
                        <span className="text-muted-foreground">Selecione o período</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar initialFocus mode="range" defaultMonth={dateRange?.from}
                      selected={dateRange} onSelect={setDateRange} numberOfMonths={2}
                      locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <Separator />

              {/* Evidence Types */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Evidências a Incluir ({selectedCount}/{EVIDENCE_OPTIONS.length})</Label>
                  <Button variant="ghost" size="sm" className="text-xs"
                    onClick={() => {
                      const allSelected = selectedCount === EVIDENCE_OPTIONS.length;
                      const newState = Object.fromEntries(EVIDENCE_OPTIONS.map(o => [o.key, !allSelected]));
                      setSelectedEvidence(newState);
                    }}>
                    {selectedCount === EVIDENCE_OPTIONS.length ? 'Desmarcar todos' : 'Selecionar todos'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {EVIDENCE_OPTIONS.map((option) => (
                    <div key={option.key}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedEvidence[option.key]
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                      onClick={() => toggleEvidence(option.key)}>
                      <Checkbox checked={selectedEvidence[option.key]}
                        onCheckedChange={() => toggleEvidence(option.key)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <span>{option.icon}</span>{option.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleExport}
                disabled={isExporting || !dateRange?.from || !dateRange?.to || selectedCount === 0}
                className="w-full" size="lg">
                {isExporting ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2" />Gerando Bundle...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" />Gerar Evidence Bundle</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <BundleHistoryPanel bundles={bundles} isLoading={isLoading} />
      </div>
    </div>
  );
}
