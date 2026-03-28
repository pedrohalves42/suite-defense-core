import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Activity, Shield, Gavel, UserCheck } from 'lucide-react';
import { useAutonomyMetrics, useAuditTrailIntegrity, useDecisionTimeline, useActiveRules } from '@/hooks/useAutonomyMetrics';
import { AutonomyMetricsCards } from '@/components/admin/autonomy/AutonomyMetricsCards';
import { DecisionTimeline } from '@/components/admin/autonomy/DecisionTimeline';
import { RuleStatusPanel } from '@/components/admin/autonomy/RuleStatusPanel';
import { AuditTrailValidator } from '@/components/admin/autonomy/AuditTrailValidator';
import { JobSuccessRateCard } from '@/components/admin/autonomy/JobSuccessRateCard';
import { HumanInTheLoopPanel } from '@/components/admin/autonomy/HumanInTheLoopPanel';

export default function AutonomyDashboard() {
  const [days, setDays] = useState(7);
  
  const { data: metrics, isLoading: metricsLoading } = useAutonomyMetrics(days);
  const { data: integrity, isLoading: integrityLoading } = useAuditTrailIntegrity();
  const { data: decisions, isLoading: decisionsLoading } = useDecisionTimeline({ limit: 50 });
  const { data: rules, isLoading: rulesLoading } = useActiveRules();

  // Transform rules data to match RuleStatusPanel expected format
  const transformedRules = (rules || []).map(rule => {
    const def = rule.definition as Record<string, unknown> | null;
    return {
      id: rule.id,
      code: rule.code,
      name: String(def?.name || rule.code),
      description: rule.description,
      severity: String(def?.severity || 'medium'),
      risk_level: String(def?.risk_level || 'low'),
      auto_execute: Boolean(def?.auto_execute),
      is_active: rule.is_enabled,
      created_at: rule.created_at,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            Dashboard de Autonomia IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento de decisões autônomas e governança do sistema
          </p>
        </div>
        <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24h</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metrics Cards */}
      <AutonomyMetricsCards metrics={metrics} isLoading={metricsLoading} days={days} />

      {/* Human-in-the-Loop Panel - Always visible */}
      <HumanInTheLoopPanel />

      {/* Tabs */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Gavel className="h-4 w-4" />
            Regras
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Integridade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DecisionTimeline decisions={decisions || []} isLoading={decisionsLoading} />
            </div>
            <div>
              <JobSuccessRateCard 
                originalRate={28} 
                correctedRate={metrics?.job_success_rate_corrected || 99} 
                isLoading={metricsLoading} 
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <RuleStatusPanel 
            rules={transformedRules} 
            isLoading={rulesLoading} 
            decisionsByRule={metrics?.decisions_by_rule}
          />
        </TabsContent>

        <TabsContent value="audit">
          <div className="grid gap-4 lg:grid-cols-2">
            <AuditTrailValidator integrity={integrity} isLoading={integrityLoading} />
            <JobSuccessRateCard 
              originalRate={28} 
              correctedRate={metrics?.job_success_rate_corrected || 99} 
              isLoading={metricsLoading} 
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
