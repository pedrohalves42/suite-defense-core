import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useMemo } from 'react';

interface RiskDimension {
  label: string;
  score: number;
  weight: number;
  detail: string;
}

interface TenantRiskData {
  overallScore: number;
  dimensions: RiskDimension[];
  trend: 'improving' | 'stable' | 'degrading';
  level: 'critical' | 'high' | 'medium' | 'low';
}

function classifyLevel(score: number): TenantRiskData['level'] {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'critical';
}

const levelConfig = {
  low: { label: 'Baixo Risco', color: 'text-cta-positive', bg: 'bg-cta-positive/10', border: 'border-cta-positive/30' },
  medium: { label: 'Risco Moderado', color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  high: { label: 'Alto Risco', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  critical: { label: 'Risco Crítico', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30' },
};

export function TenantRiskScore() {
  const { tenant } = useTenant();

  const { data: riskData, isLoading } = useQuery({
    queryKey: ['tenant-risk-score', tenant?.id],
    queryFn: async (): Promise<TenantRiskData> => {
      if (!tenant?.id) throw new Error('No tenant');
      const tid = tenant.id;

      // Fetch data from actual tables in parallel
      const [agentsRes, avRes, vulnsRes, detectionsRes, sessionsRes, rolesRes] = await Promise.all([
        // Agents: status + heartbeat
        supabase.from('agents').select('status, last_heartbeat, skip_firewall_remediation').eq('tenant_id', tid),
        // AV status
        supabase.from('antivirus_status').select('agent_id, status').eq('tenant_id', tid),
        // Unresolved vulnerabilities
        supabase.from('agent_vulnerabilities').select('severity').eq('tenant_id', tid),
        // Unacknowledged detections (threats)
        supabase.from('endpoint_detection_events').select('severity').eq('tenant_id', tid).is('acknowledged_at', null).limit(500),
        // Active sessions
        supabase.from('active_sessions').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
        // User count
        supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('tenant_id', tid),
      ]);

      const agents = agentsRes.data || [];
      const totalAgents = agents.length || 1;
      const avData = avRes.data || [];
      const vulns = vulnsRes.data || [];
      const detections = detectionsRes.data || [];

      // 1. Endpoint Health (25%) — % online + AV active
      const now = Date.now();
      const onlineAgents = agents.filter(a => {
        if (!a.last_heartbeat) return false;
        return now - new Date(a.last_heartbeat).getTime() < 15 * 60 * 1000;
      }).length;
      const avActive = avData.filter(a => a.status === 'active' || a.status === 'enabled').length;
      const avRatio = totalAgents > 0 ? avActive / totalAgents : 0;
      const endpointScore = Math.round(
        ((onlineAgents / totalAgents) * 50 + Math.min(avRatio, 1) * 50)
      );

      // 2. Vulnerability Posture (25%)
      const critVulns = vulns.filter(v => v.severity === 'critical').length;
      const highVulns = vulns.filter(v => v.severity === 'high').length;
      const vulnPenalty = Math.min(critVulns * 15 + highVulns * 5, 100);
      const vulnScore = Math.max(0, 100 - vulnPenalty);

      // 3. Active Threats (20%)
      const critDetections = detections.filter(d => d.severity === 'critical').length;
      const highDetections = detections.filter(d => d.severity === 'high').length;
      const threatPenalty = Math.min(critDetections * 20 + highDetections * 8, 100);
      const threatScore = Math.max(0, 100 - threatPenalty);

      // 4. Access Control (15%)
      const sessionCount = sessionsRes.count || 0;
      const userCount = rolesRes.count || 1;
      const avgSessionsPerUser = sessionCount / userCount;
      const accessScore = avgSessionsPerUser <= 2 ? 100 : avgSessionsPerUser <= 5 ? 70 : 40;

      // 5. Coverage (15%)
      const coverageScore = totalAgents > 0 ? Math.min(100, Math.round((onlineAgents / totalAgents) * 100)) : 0;

      const dimensions: RiskDimension[] = [
        { label: 'Saúde dos Endpoints', score: endpointScore, weight: 0.25, detail: `${onlineAgents}/${totalAgents} online` },
        { label: 'Vulnerabilidades', score: vulnScore, weight: 0.25, detail: `${critVulns} críticas, ${highVulns} altas` },
        { label: 'Ameaças Ativas', score: threatScore, weight: 0.20, detail: `${critDetections + highDetections} detecções abertas` },
        { label: 'Controle de Acesso', score: accessScore, weight: 0.15, detail: `${sessionCount} sessões ativas` },
        { label: 'Cobertura', score: coverageScore, weight: 0.15, detail: `${Math.round((onlineAgents / totalAgents) * 100)}% conectados` },
      ];

      const overallScore = Math.round(
        dimensions.reduce((acc, d) => acc + d.score * d.weight, 0)
      );

      return {
        overallScore,
        dimensions,
        trend: 'stable' as const,
        level: classifyLevel(overallScore),
      };
    },
    enabled: !!tenant?.id,
    staleTime: 600_000,
    refetchInterval: false,
  });

  if (isLoading || !riskData) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 animate-pulse bg-muted/30 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const config = levelConfig[riskData.level];
  const TrendIcon = riskData.trend === 'improving' ? TrendingUp : riskData.trend === 'degrading' ? TrendingDown : Minus;

  return (
    <Card className={`border ${config.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className={`h-4 w-4 ${config.color}`} />
            Score de Segurança
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className={`${config.color} ${config.border} text-xs`}>
                  {config.label}
                  <TrendIcon className="h-3 w-3 ml-1" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Calculado em tempo real a partir de 5 dimensões de risco</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main score */}
        <div className="flex items-end gap-3">
          <span className={`text-4xl font-bold ${config.color}`}>{riskData.overallScore}</span>
          <span className="text-sm text-muted-foreground pb-1">/100</span>
        </div>

        <Progress
          value={riskData.overallScore}
          className="h-2"
        />

        {/* Dimensions breakdown */}
        <div className="space-y-2 pt-2">
          {riskData.dimensions.map((dim) => (
            <div key={dim.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{dim.label}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground/50" />
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">{dim.detail}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      dim.score >= 80 ? 'bg-cta-positive' :
                      dim.score >= 60 ? 'bg-yellow-500' :
                      dim.score >= 40 ? 'bg-orange-500' :
                      'bg-destructive'
                    }`}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                <span className="w-7 text-right font-mono text-muted-foreground">{dim.score}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
