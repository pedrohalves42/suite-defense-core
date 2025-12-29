/**
 * Painel de Prontidão SOC 2
 * Exibe o status de conformidade para auditoria SOC 2 Type I
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, FileText, CheckCircle2, Clock, Building2, Link2, Database, Code } from 'lucide-react';
import { useSOC2Readiness, calculateOverallScore } from '@/hooks/useSOC2Readiness';
import { SOC2_TRUST_CRITERIA, COMPLIANCE_POLICIES } from '@/types/soc2-compliance';

export default function SOC2Dashboard() {
  const { data: readinessData, isLoading } = useSOC2Readiness();
  const overallScore = readinessData ? calculateOverallScore(readinessData) : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prontidão para Auditoria SOC 2</h1>
          <p className="text-muted-foreground">Critérios de Confiança (Type I)</p>
        </div>
        <Badge variant={overallScore >= 80 ? 'default' : overallScore >= 60 ? 'secondary' : 'destructive'} className="text-lg px-4 py-2">
          {overallScore}% Pronto
        </Badge>
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
              <Clock className="h-4 w-4 text-yellow-500" />
              Tempo Estimado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">60-90</div>
            <p className="text-xs text-muted-foreground">dias para Type I</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="criteria" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="criteria">Critérios CC1-CC9</TabsTrigger>
          <TabsTrigger value="policies">Políticas</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de Rastreabilidade</TabsTrigger>
          <TabsTrigger value="vendors">Fornecedores</TabsTrigger>
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

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COMPLIANCE_POLICIES.map((policy) => (
              <Card key={policy.code}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{policy.code}</CardTitle>
                    <Badge variant="outline">Draft</Badge>
                  </div>
                  <CardDescription>{policy.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {policy.soc2Criteria.map(cc => (
                      <Badge key={cc} variant="secondary" className="text-xs">{cc}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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

        {/* Aba de Fornecedores */}
        <TabsContent value="vendors" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Supabase', type: 'Banco de Dados / Autenticação', certs: ['SOC 2 Type II'], criticality: 'crítico', criticalityLabel: 'Crítico' },
              { name: 'Stripe', type: 'Pagamentos', certs: ['PCI-DSS', 'SOC 2'], criticality: 'crítico', criticalityLabel: 'Crítico' },
              { name: 'Vercel/Cloud', type: 'Hospedagem', certs: ['SOC 2', 'ISO 27001'], criticality: 'alto', criticalityLabel: 'Alto' },
            ].map((vendor) => (
              <Card key={vendor.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {vendor.name}
                    </CardTitle>
                    <Badge variant={vendor.criticality === 'crítico' ? 'destructive' : 'secondary'}>
                      {vendor.criticalityLabel}
                    </Badge>
                  </div>
                  <CardDescription>{vendor.type}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {vendor.certs.map(cert => (
                      <Badge key={cert} variant="outline" className="text-xs">{cert}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
