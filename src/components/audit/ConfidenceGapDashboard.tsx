import React from 'react';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Target, TrendingDown, TrendingUp, Shield, RefreshCw, History } from 'lucide-react';
import { useCalculateConfidenceGap, useLatestConfidenceGap, useConfidenceGapTrend, useConfidenceGapHistory } from '@/hooks/useConfidenceGap';
import { SectionDivider } from '@/components/ui/section-divider';
import { formatRelativeTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

interface DimensionalScore {
  dimension: string;
  ana_score: number;
  red_score: number;
  gap: number;
}

const DIMENSION_LABELS: Record<string, string> = {
  data_protection: 'Proteção de Dados',
  access_control: 'Controle de Acesso',
  audit_logging: 'Logs de Auditoria',
  vulnerability_management: 'Gestão de Vulnerabilidades',
  incident_response: 'Resposta a Incidentes',
  compliance: 'Conformidade',
  network_security: 'Segurança de Rede',
  endpoint_protection: 'Proteção de Endpoints',
  cross_tenant_isolation: 'Isolamento Multi-tenant',
};

const DIMENSION_ACTIONS: Record<string, string> = {
  data_protection: 'Revisar políticas de RLS e criptografia de dados sensíveis',
  access_control: 'Auditar permissões de usuários e implementar MFA',
  audit_logging: 'Verificar integridade da cadeia de hash dos logs',
  vulnerability_management: 'Executar scan de vulnerabilidades e corrigir CVEs críticos',
  incident_response: 'Testar playbooks de resposta e atualizar procedimentos',
  compliance: 'Revisar checklist SOC2/ISO e corrigir gaps de documentação',
  network_security: 'Verificar regras de firewall e segmentação de rede',
  endpoint_protection: 'Atualizar assinaturas de antivírus e políticas de segurança',
  cross_tenant_isolation: 'Validar RLS policies e testar isolamento entre tenants',
};

export default function ConfidenceGapDashboard() {
  const { tenant } = useTenant();
  const { data: latestGap, isLoading: loadingGap } = useLatestConfidenceGap();
  const { data: gapTrend } = useConfidenceGapTrend();
  const { data: gapHistory } = useConfidenceGapHistory();
  const calculateGap = useCalculateConfidenceGap();

  // TUNING: Use latestGap data directly instead of a separate redundant query
  // Fixed: was using non-existent column 'calculated_at' (should be 'created_at')
  // Fixed: was using hardcoded scores instead of actual dimension_gaps from DB
  const dimensionalScores = React.useMemo((): DimensionalScore[] => {
    if (!latestGap?.dimension_gaps) return [];
    
    const gaps = latestGap.dimension_gaps as Record<string, number>;
    // Map DB dimension keys to our labels, using both possible key formats
    const DIMENSION_KEY_MAP: Record<string, string> = {
      system_identity: 'data_protection',
      governance: 'access_control',
      evidence_proof: 'audit_logging',
      human_oversight: 'vulnerability_management',
      operational_resilience: 'incident_response',
      compliance_alignment: 'compliance',
      transparency_explainability: 'network_security',
      market_trust: 'endpoint_protection',
      cross_tenant_isolation: 'cross_tenant_isolation',
    };

    return Object.entries(gaps).map(([key, gapValue]) => {
      const mappedKey = DIMENSION_KEY_MAP[key] || key;
      return {
        dimension: mappedKey,
        ana_score: latestGap.ana_score,
        red_score: latestGap.red_score,
        gap: typeof gapValue === 'number' ? gapValue : 0,
      };
    }).filter(d => DIMENSION_LABELS[d.dimension]); // Only show known dimensions
  }, [latestGap]);

  const overallGap = latestGap?.confidence_gap || 0;
  const healthStatus = latestGap?.health_status || 'unknown';
  const criticalGaps = dimensionalScores?.filter(d => Math.abs(d.gap) > 5) || [];
  
  const getGapColor = (gap: number) => {
    const absGap = Math.abs(gap);
    if (absGap > 10) return 'text-destructive';
    if (absGap > 5) return 'text-orange-500';
    if (absGap > 2) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getGapBadge = (gap: number) => {
    const absGap = Math.abs(gap);
    if (absGap > 10) return <Badge variant="destructive">Crítico</Badge>;
    if (absGap > 5) return <Badge className="bg-orange-500">Alto</Badge>;
    if (absGap > 2) return <Badge className="bg-yellow-500 text-black">Médio</Badge>;
    return <Badge className="bg-green-500">Alinhado</Badge>;
  };

  const getHealthBadge = (status: string) => {
    switch (status) {
      case 'healthy': return <Badge className="bg-green-500">Saudável</Badge>;
      case 'warning': return <Badge className="bg-yellow-500 text-black">Atenção</Badge>;
      case 'critical': return <Badge variant="destructive">Crítico</Badge>;
      default: return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const trendDirection = gapTrend && gapTrend.length >= 2 
    ? (gapTrend[0]?.confidence_gap || 0) - (gapTrend[gapTrend.length - 1]?.confidence_gap || 0) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={healthStatus === 'critical' ? 'border-destructive/50' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <p className={`text-2xl font-bold ${getGapColor(overallGap)}`}>
                  {overallGap > 0 ? '+' : ''}{overallGap.toFixed(1)}
                </p>
                <p className="text-sm text-muted-foreground">Gap de Confiança</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <div className="flex items-center gap-2">
                {getHealthBadge(healthStatus)}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Status Geral</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{criticalGaps.length}</p>
                <p className="text-sm text-muted-foreground">Dimensões Críticas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              {trendDirection > 0 ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : trendDirection < 0 ? (
                <TrendingDown className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className={`text-2xl font-bold ${trendDirection > 0 ? 'text-green-500' : trendDirection < 0 ? 'text-destructive' : ''}`}>
                  {trendDirection > 0 ? '+' : ''}{trendDirection.toFixed(1)}
                </p>
                <p className="text-sm text-muted-foreground">Tendência 30d</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recalculate Button */}
      <div className="flex justify-end">
        <Button 
          onClick={() => calculateGap.mutate({
            tenantId: tenant!.id,
            auditId: latestGap?.audit_id || '',
            redTeamId: latestGap?.red_team_id || '',
            anaScore: latestGap?.ana_score || 70,
            redScore: latestGap?.red_score || 65,
            dimensionGaps: latestGap?.dimension_gaps || {},
          })}
          disabled={calculateGap.isPending || !tenant?.id || !latestGap?.audit_id}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${calculateGap.isPending ? 'animate-spin' : ''}`} />
          {calculateGap.isPending ? 'Calculando...' : 'Recalcular Gap'}
        </Button>
      </div>

      {/* Dimensional Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Análise Dimensional: Ana vs Red Team</CardTitle>
          <CardDescription>
            Comparação entre a avaliação interna (Ana) e a avaliação adversarial (Red Team)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingGap ? (
            <p className="text-muted-foreground">Carregando análise...</p>
          ) : !dimensionalScores?.length ? (
            <div className="text-center py-8">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">Nenhuma análise dimensional disponível</p>
              <p className="text-muted-foreground">Execute uma auditoria completa para ver os gaps por dimensão.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {dimensionalScores.map(dim => (
                <div key={dim.dimension} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{DIMENSION_LABELS[dim.dimension] || dim.dimension}</span>
                      {getGapBadge(dim.gap)}
                    </div>
                  </div>
                  
                  {/* Suggested action for critical gaps */}
                  {Math.abs(dim.gap) > 5 && (
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        <span className="font-medium">Ação recomendada:</span> {DIMENSION_ACTIONS[dim.dimension]}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gap History Chart */}
      {gapTrend && gapTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Gap (Últimos 30 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {gapTrend.slice(-30).map((point, index) => {
                const gap = point.confidence_gap || 0;
                const height = Math.min(100, Math.max(10, 50 + gap * 5));
                const color = gap > 5 ? 'bg-destructive' 
                  : gap > 2 ? 'bg-orange-500' 
                  : gap > 0 ? 'bg-yellow-500' 
                  : 'bg-green-500';
                return (
                  <div
                    key={index}
                    className={`flex-1 ${color} rounded-t`}
                    style={{ height: `${height}%` }}
                    title={`Gap: ${gap.toFixed(1)}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>30 dias atrás</span>
              <span>Hoje</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Gap History Table */}
      {gapHistory && gapHistory.length > 0 && (
        <>
          <SectionDivider label="Histórico Detalhado" />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5" />
                Registros Recentes
              </CardTitle>
              <CardDescription>Últimas {Math.min(gapHistory.length, 10)} medições de gap de confiança</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {gapHistory.slice(0, 10).map((gap) => (
                  <div 
                    key={gap.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        gap.health_status === 'healthy' ? 'bg-green-500' :
                        gap.health_status === 'attention' ? 'bg-yellow-500' : 'bg-red-500'
                      )} />
                      <div>
                        <p className="text-sm font-medium">
                          Gap: {gap.confidence_gap.toFixed(1)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(gap.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {gap.gap_delta !== null && gap.gap_delta !== 0 && (
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          gap.gap_delta < 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {gap.gap_delta < 0 ? (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          )}
                          {gap.gap_delta > 0 ? '+' : ''}{gap.gap_delta.toFixed(1)}
                        </Badge>
                      )}
                      {gap.alert_triggered && (
                        <Badge variant="destructive" className="text-xs">
                          Alerta
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
