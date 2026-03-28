import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Download, Loader2, Shield, Award, History, Scale, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { GeneratedReportsList } from '@/components/admin/GeneratedReportsList';
import { ComplianceReportGenerator } from '@/components/admin/ComplianceReportGenerator';
import { LGPDMonthlyReport } from '@/components/admin/LGPDMonthlyReport';
import { SecurityAuditReport } from '@/components/security/SecurityAuditReport';
import { formatBrazilDateTime } from '@/lib/date-utils';
import { useTenant } from '@/hooks/useTenant';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { logger } from '@/lib/logger';

import type { SecurityReport, Agent } from './types';
import { ReportSummaryCards } from './ReportSummaryCards';
import { exportBasicPDF } from './exportPDF';
import { exportLaudo } from './exportLaudo';
import { exportCSV } from './exportCSV';

export default function Reports() {
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const { tenant } = useTenant();
  const { activeTenant, loading: tenantLoading } = useActiveTenant();

  const { data: agents } = useQuery({
    queryKey: ['agents-list-reports', activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return [];
      const { data, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: activeTenant.id,
        p_include_archived: false,
      });
      if (error) throw error;
      return ((data || []) as any as RpcAgentRow[])
        .filter((a) => a.status === 'active')
        .map((a) => ({ id: a.id, agent_name: a.agent_name, status: a.status } as Agent))
        .sort((a, b) => a.agent_name.localeCompare(b.agent_name));
    },
    enabled: !tenantLoading && !!activeTenant?.id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: report, refetch: refetchReport, isLoading: isLoadingReport } = useQuery({
    queryKey: ['security-report', selectedAgent],
    queryFn: async () => {
      const params = new URLSearchParams({ format: 'summary' });
      if (selectedAgent !== 'all') params.append('agent_id', selectedAgent);
      const { data, error } = await supabase.functions.invoke(
        `generate-security-report?${params.toString()}`,
        { method: 'GET' }
      );
      if (error) throw error;
      return data as SecurityReport;
    },
    enabled: false,
  });

  const fetchReportData = async (format: string): Promise<SecurityReport> => {
    const params = new URLSearchParams({ format });
    if (selectedAgent !== 'all') params.append('agent_id', selectedAgent);
    const { data, error } = await supabase.functions.invoke(
      `generate-security-report?${params.toString()}`,
      { method: 'GET' }
    );
    if (error) throw new Error(`Erro ao buscar dados: ${error.message}`);
    if (!data) throw new Error('Nenhum dado retornado do servidor');
    return data as SecurityReport;
  };

  const handleGenerateReport = async (downloadFull = false) => {
    setIsGenerating(true);
    try {
      if (downloadFull) {
        const data = await fetchReportData('json');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `security-report-${selectedAgent}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Relatório completo baixado com sucesso!');
      } else {
        await refetchReport();
        toast.success('Relatório de segurança gerado com sucesso!');
      }
    } catch (error) {
      logger.error('Error generating report:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      if (errorMessage.includes('NO_TENANT') || errorMessage.includes('não está associado')) {
        toast.error('Você não está associado a nenhum tenant. Contate o administrador.');
      } else if (errorMessage.includes('Edge Function') || errorMessage.includes('Failed to fetch')) {
        toast.error('Erro ao conectar com o servidor. Tente novamente em alguns segundos.');
      } else {
        toast.error(`Erro ao gerar relatório: ${errorMessage}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    setIsGenerating(true);
    try {
      toast.info('Gerando relatório PDF...');
      const data = await fetchReportData('json');
      await exportBasicPDF(data, selectedAgent, agents);
      toast.success('Relatório PDF gerado com sucesso!');
    } catch (error) {
      logger.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportLaudo = async () => {
    setIsGenerating(true);
    try {
      toast.info('Gerando Laudo de Segurança...');
      const data = await fetchReportData('json');
      await exportLaudo(data, selectedAgent, agents);
      toast.success('Laudo de Segurança gerado com sucesso!');
    } catch (error) {
      logger.error('Error exporting Laudo:', error);
      toast.error('Erro ao gerar laudo: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportCSV = async () => {
    setIsGenerating(true);
    try {
      const data = await fetchReportData('json');
      exportCSV(data, selectedAgent);
      toast.success('Relatório CSV baixado com sucesso!');
    } catch (error) {
      logger.error('Error exporting CSV:', error);
      toast.error('Erro ao exportar CSV: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Relatórios de Segurança
            </h2>
            <p className="text-sm text-muted-foreground">
              Gere relatórios consolidados de todos os dados de segurança coletados
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Gerar Relatório
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Laudos Gerados
          </TabsTrigger>
          <TabsTrigger value="security-audit" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Auditoria
          </TabsTrigger>
          <TabsTrigger value="lgpd-monthly" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            LGPD Mensal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compliance" className="space-y-4">
          <ComplianceReportGenerator />
        </TabsContent>

        <TabsContent value="lgpd-monthly" className="space-y-4">
          <LGPDMonthlyReport />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <GeneratedReportsList />
        </TabsContent>

        <TabsContent value="security-audit" className="space-y-4">
          <SecurityAuditReport />
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gerar Relatório</CardTitle>
              <CardDescription>
                Selecione um agente específico ou gere relatório de todos os agentes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-2 block">Agente</label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um agente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Agentes</SelectItem>
                      {agents?.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.agent_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => handleGenerateReport(false)} disabled={isGenerating || isLoadingReport}>
                  {(isGenerating || isLoadingReport) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <FileText className="mr-2 h-4 w-4" />
                  Gerar Sumário
                </Button>
                <Button variant="default" onClick={handleExportLaudo} disabled={isGenerating} className="bg-primary hover:bg-primary/90">
                  {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Award className="mr-2 h-4 w-4" />
                  Exportar Laudo
                </Button>
                <Button variant="default" onClick={handleExportPDF} disabled={isGenerating} className="bg-destructive hover:bg-destructive/90">
                  {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <FileText className="mr-2 h-4 w-4" />
                  Exportar PDF
                </Button>
                <Button variant="outline" onClick={handleExportCSV} disabled={isGenerating}>
                  {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Exportar CSV
                </Button>
                <Button variant="secondary" onClick={() => handleGenerateReport(true)} disabled={isGenerating}>
                  {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Download className="mr-2 h-4 w-4" />
                  JSON Completo
                </Button>
              </div>
            </CardContent>
          </Card>

          {report && <ReportSummaryCards report={report} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
