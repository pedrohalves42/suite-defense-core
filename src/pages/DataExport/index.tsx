import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileSpreadsheet, FileText, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { useDataExport, type ExportType, type ExportFormat, type DateRange } from './useDataExport';

export default function DataExport() {
  const {
    exportType, setExportType, dateRange, setDateRange,
    exportFormat, setExportFormat, isExporting, stats, exportData, t,
  } = useDataExport();

  const exportOptions = [
    { value: 'agents', label: t('dataExportPage.agents'), count: stats?.agents || 0, icon: CheckCircle },
    { value: 'scans', label: t('dataExportPage.virusScans'), count: stats?.scans || 0, icon: FileText },
    { value: 'jobs', label: t('dataExportPage.jobs'), count: stats?.jobs || 0, icon: Calendar },
    { value: 'quarantine', label: t('dataExportPage.quarantine'), count: stats?.quarantine || 0, icon: Download },
    { value: 'audit_logs', label: t('dataExportPage.auditLogs'), count: stats?.auditLogs || 0, icon: FileText },
  ];

  const getAvailableText = () => {
    switch (exportType) {
      case 'agents': return t('dataExportPage.agentsAvailable', { count: stats?.agents || 0 });
      case 'scans': return t('dataExportPage.scansAvailable', { count: stats?.scans || 0 });
      case 'jobs': return t('dataExportPage.jobsAvailable', { count: stats?.jobs || 0 });
      case 'quarantine': return t('dataExportPage.quarantineAvailable', { count: stats?.quarantine || 0 });
      case 'audit_logs': return t('dataExportPage.auditLogsAvailable', { count: stats?.auditLogs || 0 });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-bold">{t('dataExportPage.title')}</h2>
          <p className="text-muted-foreground">{t('dataExportPage.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {exportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card key={option.value} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{option.count}</Badge>
                </div>
                <CardTitle className="text-sm">{option.label}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dataExportPage.exportConfig')}</CardTitle>
          <CardDescription>{t('dataExportPage.exportConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('dataExportPage.dataType')}</Label>
              <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {exportOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('dataExportPage.period')}</Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('dataExportPage.last7Days')}</SelectItem>
                  <SelectItem value="30">{t('dataExportPage.last30Days')}</SelectItem>
                  <SelectItem value="90">{t('dataExportPage.last90Days')}</SelectItem>
                  <SelectItem value="all">{t('dataExportPage.allRecords')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('dataExportPage.format')}</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2"><FileText className="h-4 w-4" />CSV (Excel/Google Sheets)</div>
                  </SelectItem>
                  <SelectItem value="excel">
                    <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Excel (XLSX)</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">{getAvailableText()}</div>
            <Button onClick={exportData} disabled={isExporting} size="lg" className="gap-2">
              {isExporting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{t('dataExportPage.exporting')}</>
              ) : (
                <><Download className="h-4 w-4" />{t('dataExportPage.exportBtn', { format: exportFormat === 'csv' ? 'CSV' : 'Excel' })}</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('dataExportPage.csvFormat')}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>✓ {t('dataExportPage.csvFeature1')}</p>
            <p>✓ {t('dataExportPage.csvFeature2')}</p>
            <p>✓ {t('dataExportPage.csvFeature3')}</p>
            <p>✓ {t('dataExportPage.csvFeature4')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('dataExportPage.excelFormat')}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>✓ {t('dataExportPage.excelFeature1')}</p>
            <p>✓ {t('dataExportPage.excelFeature2')}</p>
            <p>✓ {t('dataExportPage.excelFeature3')}</p>
            <p>✓ {t('dataExportPage.excelFeature4')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dataExportPage.useCases')}</CardTitle>
          <CardDescription>{t('dataExportPage.useCasesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {t('dataExportPage.offlineAnalysis')}
              </h4>
              <p className="text-sm text-muted-foreground">{t('dataExportPage.offlineAnalysisDesc')}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {t('dataExportPage.biIntegration')}
              </h4>
              <p className="text-sm text-muted-foreground">{t('dataExportPage.biIntegrationDesc')}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {t('dataExportPage.compliance')}
              </h4>
              <p className="text-sm text-muted-foreground">{t('dataExportPage.complianceDesc')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
