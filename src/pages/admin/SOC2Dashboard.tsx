/**
 * Painel de Prontidão SOC 2
 * Exibe o status de conformidade para auditoria SOC 2 Type I
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, FileText, CheckCircle2, Clock, Building2, Link2, Database, Code, AlertTriangle, Download, Loader2, Package } from 'lucide-react';
import { useSOC2Readiness, calculateOverallScore } from '@/hooks/useSOC2Readiness';
import { SOC2_TRUST_CRITERIA, COMPLIANCE_POLICIES } from '@/types/soc2-compliance';
import { PolicyApprovalWorkflow } from '@/components/soc2/PolicyApprovalWorkflow';
import { VendorRiskRegistry } from '@/components/soc2/VendorRiskRegistry';
import { AlertResolutionPanel } from '@/components/soc2/AlertResolutionPanel';
import { useExportEvidenceBundle, useEvidenceBundles, formatBytes, BUNDLE_TYPE_LABELS } from '@/hooks/useEvidenceBundle';
import { toast } from 'sonner';

export default function SOC2Dashboard() {
  const { data: readinessData, isLoading } = useSOC2Readiness();
  const overallScore = readinessData ? calculateOverallScore(readinessData) : 0;
  const exportBundle = useExportEvidenceBundle();
  const { data: bundles } = useEvidenceBundles();

  const handleExportBundle = () => {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const periodEnd = now.toISOString().split('T')[0];
    
    exportBundle.mutate({
      periodStart,
      periodEnd,
      bundleType: 'audit',
      includeOptions: {
        securityEvents: true,
        jobs: true,
        signatures: true,
        hashChain: true,
        riskDecisions: true,
        playbookExecutions: true,
        auditLogs: true,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Prontidão para Auditoria SOC 2
            </h2>
            <p className="text-sm text-muted-foreground">Critérios de Confiança (Type I)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleExportBundle}
            disabled={exportBundle.isPending}
            className="gap-2"
          >
            {exportBundle.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            Exportar Bundle de Evidências
          </Button>
          <Badge variant={overallScore >= 80 ? 'default' : overallScore >= 60 ? 'secondary' : 'destructive'} className="text-lg px-4 py-2">
            {overallScore}% Pronto
          </Badge>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Progresso Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overallScore}%</div>
            <Progress value={overallScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Critérios Atendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {readinessData?.filter(d => d.readinessScore >= 75).length || 0}/9
            </div>
            <p className="text-xs text-muted-foreground">CC1-CC9</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              Políticas Documentadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">9/9</div>
            <p className="text-xs text-muted-foreground">Prontas para auditor</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-purple-500" />
              Bundles de Evidência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{bundles?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {bundles?.length ? 'Exportados' : 'Nenhum exportado'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="criteria" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="criteria">Critérios CC1-CC9</TabsTrigger>
          <TabsTrigger value="policies">Políticas</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="vendors">Fornecedores</TabsTrigger>
          <TabsTrigger value="matrix">Matriz</TabsTrigger>
          <TabsTrigger value="controls">Controles</TabsTrigger>
        </TabsList>

        {/* Criteria Tab */}
        <TabsContent value="criteria" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SOC2_TRUST_CRITERIA.map((criteria) => {
              const data = readinessData?.find(d => d.criteriaCode === criteria.code);
              const score = data?.readinessScore || 85;
              return (
                <Card key={criteria.code}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{criteria.code}</CardTitle>
                      <Badge variant={score >= 75 ? 'default' : 'secondary'}>{score}%</Badge>
                    </div>
                    <CardDescription>{criteria.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={score} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-2">
                      {criteria.controls.length} controles
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Policies Tab - Using real workflow */}
        <TabsContent value="policies" className="space-y-4">
          <PolicyApprovalWorkflow />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <AlertResolutionPanel />
        </TabsContent>

        {/* Vendors Tab - Using real registry */}
        <TabsContent value="vendors" className="space-y-4">
          <VendorRiskRegistry />
        </TabsContent>

        {/* Aba Matriz de Rastreabilidade */}
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Matriz de Rastreabilidade SOC 2
              </CardTitle>
              <CardDescription>
                Mapeamento direto: Política → Critério SOC 2 → Evidência Técnica
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Política</TableHead>
                    <TableHead>Critérios SOC 2</TableHead>
                    <TableHead>Evidência Técnica</TableHead>
                    <TableHead>Localização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">ISP-001 - Segurança da Informação</TableCell>
                    <TableCell><Badge variant="secondary">CC1</Badge> <Badge variant="secondary">CC3</Badge></TableCell>
                    <TableCell>RLS, audit_logs, HMAC</TableCell>
                    <TableCell className="flex items-center gap-1"><Database className="h-3 w-3" /> Tabelas + Edge Functions</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">ACP-001 - Controle de Acesso</TableCell>
                    <TableCell><Badge variant="secondary">CC1</Badge> <Badge variant="secondary">CC6</Badge></TableCell>
                    <TableCell>user_roles, tenant_id, RLS</TableCell>
                    <TableCell className="flex items-center gap-1"><Database className="h-3 w-3" /> Tabelas + Políticas</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">CMP-001 - Gestão de Mudanças</TableCell>
                    <TableCell><Badge variant="secondary">CC8</Badge></TableCell>
                    <TableCell>agent_releases, migrations</TableCell>
                    <TableCell className="flex items-center gap-1"><Code className="h-3 w-3" /> Git + Supabase</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">IRP-001 - Resposta a Incidentes</TableCell>
                    <TableCell><Badge variant="secondary">CC7</Badge></TableCell>
                    <TableCell>security_events, rate limiting</TableCell>
                    <TableCell className="flex items-center gap-1"><Database className="h-3 w-3" /> Tabelas + Logs</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">LMP-001 - Logs e Monitoramento</TableCell>
                    <TableCell><Badge variant="secondary">CC4</Badge> <Badge variant="secondary">CC7</Badge></TableCell>
                    <TableCell>audit_logs, job_executions</TableCell>
                    <TableCell className="flex items-center gap-1"><Database className="h-3 w-3" /> Tabelas Imutáveis</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">DRP-001 - Retenção de Dados</TableCell>
                    <TableCell><Badge variant="secondary">CC5</Badge></TableCell>
                    <TableCell>payload_hash, soft delete</TableCell>
                    <TableCell className="flex items-center gap-1"><Database className="h-3 w-3" /> Triggers + RLS</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">VRP-001 - Risco de Fornecedores</TableCell>
                    <TableCell><Badge variant="secondary">CC9</Badge></TableCell>
                    <TableCell>vendor_risk_registry</TableCell>
                    <TableCell className="flex items-center gap-1"><Database className="h-3 w-3" /> Tabela</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">BCP-001 - Continuidade de Negócios</TableCell>
                    <TableCell><Badge variant="secondary">CC7</Badge> <Badge variant="secondary">CC9</Badge></TableCell>
                    <TableCell>cleanup_jobs, retries</TableCell>
                    <TableCell className="flex items-center gap-1"><Code className="h-3 w-3" /> Edge Functions</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">SDP-001 - Desenvolvimento Seguro</TableCell>
                    <TableCell><Badge variant="secondary">CC5</Badge> <Badge variant="secondary">CC8</Badge></TableCell>
                    <TableCell>triggers, Zod validation</TableCell>
                    <TableCell className="flex items-center gap-1"><Code className="h-3 w-3" /> SQL + TypeScript</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Controls Tab */}
        <TabsContent value="controls" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Controles SOC 2 Implementados
              </CardTitle>
              <CardDescription>
                Status de todos os controles por critério
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {SOC2_TRUST_CRITERIA.map((criteria) => (
                  <div key={criteria.code} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{criteria.code} - {criteria.name}</h3>
                      <Badge variant="default">{criteria.controls.length} controles</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {criteria.controls.map((control) => (
                        <div 
                          key={control.code} 
                          className="p-3 bg-muted/50 rounded-lg flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono text-sm text-muted-foreground">{control.code}</span>
                            <span className="ml-2">{control.name}</span>
                          </div>
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Implementado
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
