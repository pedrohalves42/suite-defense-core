import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Brain, Shield, DollarSign, Activity,
  AlertTriangle, CheckCircle2, Clock, Zap
} from 'lucide-react';
import { useAIGovernance } from './useAIGovernance';

export default function AIGovernance() {
  const { aggregatedMetrics, prompts } = useAIGovernance();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Governança de IA</h1>
          <p className="text-muted-foreground">Monitoramento, custos e compliance</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Chamadas (24h)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedMetrics.totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Inferências de IA</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedMetrics.successRate.toFixed(1)}%</div>
            <Progress value={aggregatedMetrics.successRate} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Latência Média</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(aggregatedMetrics.avgLatency)}ms</div>
            <p className="text-xs text-muted-foreground">SLO: &lt; 5000ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Custo Estimado (24h)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${aggregatedMetrics.estimatedCostUsd.toFixed(4)}</div>
            <p className="text-xs text-muted-foreground">{aggregatedMetrics.totalTokens.toLocaleString()} tokens</p>
          </CardContent>
        </Card>
      </div>

      {/* Circuit Breaker Alert */}
      {aggregatedMetrics.circuitBreakerTrips > 0 && (
        <Card className="border-destructive">
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">Alertas de Circuit Breaker</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{aggregatedMetrics.circuitBreakerTrips} trips nas últimas 24h. Verifique os logs para mais detalhes.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Model Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Uso por Modelo</CardTitle>
            <CardDescription>Performance e consumo por modelo de IA</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Sucesso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregatedMetrics.byModel.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum dado disponível</TableCell>
                  </TableRow>
                ) : (
                  aggregatedMetrics.byModel.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium">{model.model}</TableCell>
                      <TableCell className="text-right">{model.total_calls}</TableCell>
                      <TableCell className="text-right">{model.total_tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={model.success_rate >= 95 ? 'default' : 'destructive'}>{model.success_rate.toFixed(1)}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Prompt Registry */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Registro de Prompts</CardTitle>
            <CardDescription>Versionamento e integridade dos prompts</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Descrição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-mono text-sm">{prompt.id}</TableCell>
                    <TableCell><Badge variant="outline">{prompt.version}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{prompt.hash.substring(0, 16)}...</TableCell>
                    <TableCell className="text-sm">{prompt.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Costs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Custos por Tenant</CardTitle>
          <CardDescription>Consumo de IA por cliente nas últimas 24h</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant ID</TableHead>
                <TableHead className="text-right">Chamadas</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Custo Est.</TableHead>
                <TableHead className="text-right">Taxa Sucesso</TableHead>
                <TableHead className="text-right">Latência Média</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aggregatedMetrics.byTenant.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum dado disponível</TableCell>
                </TableRow>
              ) : (
                aggregatedMetrics.byTenant.map((tenant) => (
                  <TableRow key={tenant.tenant_id}>
                    <TableCell className="font-mono text-sm">{tenant.tenant_name}</TableCell>
                    <TableCell className="text-right">{tenant.total_calls}</TableCell>
                    <TableCell className="text-right">{tenant.total_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${tenant.estimated_cost_usd.toFixed(4)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={tenant.success_rate >= 95 ? 'default' : 'destructive'}>{tenant.success_rate.toFixed(1)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">{Math.round(tenant.avg_latency_ms)}ms</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Compliance Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Checklist de Compliance</CardTitle>
          <CardDescription>Status dos controles de governança</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Segurança', items: ['Sanitização de inputs', 'Circuit breakers ativos', 'Rate limiting configurado', 'Prompt injection prevention'] },
              { title: 'Privacidade', items: ['Anonimização de dados', 'Isolamento por tenant', 'Logs sem PII', 'Retenção 30 dias'] },
              { title: 'Auditoria', items: ['Versionamento de prompts', 'Logs estruturados', 'Métricas persistidas', 'Rastreabilidade completa'] },
            ].map((section) => (
              <div key={section.title} className="space-y-2">
                <h4 className="font-medium">{section.title}</h4>
                <div className="space-y-1 text-sm">
                  {section.items.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
