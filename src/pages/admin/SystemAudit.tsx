import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Play, BarChart3, FileText, Clock, RefreshCw, Skull, TrendingUp, AlertTriangle } from 'lucide-react';
import { 
  useAuditHistory, 
  useAuditById, 
  useRunAudit, 
  useLatestAudit,
  auditToResult,
  AuditResult 
} from '@/hooks/useSystemAudit';
import { useLatestRedTeam } from '@/hooks/useRedTeamAssessment';
import { useLatestConfidenceGap, useConfidenceGapTrend } from '@/hooks/useConfidenceGap';
import { useRunFullAudit } from '@/hooks/useRunFullAudit';
import { AuditRadarChart } from '@/components/admin/audit/AuditRadarChart';
import { AuditDimensionCard } from '@/components/admin/audit/AuditDimensionCard';
import { AuditTimeline } from '@/components/admin/audit/AuditTimeline';
import { AuditExecutiveSummary } from '@/components/admin/audit/AuditExecutiveSummary';
import { RedTeamSummary } from '@/components/admin/audit/RedTeamSummary';
import { ConfidenceGapChart } from '@/components/admin/audit/ConfidenceGapChart';
import { FalsificationCriteria, FalsificationCriterion } from '@/components/admin/audit/FalsificationCriteria';

export default function SystemAudit() {
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const { data: auditHistory, isLoading: historyLoading, refetch: refetchHistory } = useAuditHistory(20);
  const { data: latestAudit } = useLatestAudit();
  const { data: selectedAuditData } = useAuditById(selectedAuditId);
  const { runAudit, isRunning } = useRunAudit();
  const { data: latestRedTeam } = useLatestRedTeam();
  const { data: latestConfidenceGap } = useLatestConfidenceGap();
  const { data: confidenceGapTrend } = useConfidenceGapTrend();
  const { runFullAudit, isRunning: isFullAuditRunning } = useRunFullAudit();

  // Determine which audit to display
  const currentAudit = useMemo(() => {
    if (selectedAuditId && selectedAuditData) {
      return auditToResult(selectedAuditData);
    }
    if (latestAudit) {
      return auditToResult(latestAudit);
    }
    return null;
  }, [selectedAuditId, selectedAuditData, latestAudit]);

  // Get previous audit for comparison
  const previousAudit = useMemo(() => {
    if (!auditHistory || auditHistory.length < 2) return null;
    
    const currentIndex = selectedAuditId 
      ? auditHistory.findIndex(a => a.id === selectedAuditId)
      : 0;
    
    if (currentIndex === -1 || currentIndex >= auditHistory.length - 1) return null;
    
    return auditToResult(auditHistory[currentIndex + 1]);
  }, [auditHistory, selectedAuditId]);

  const handleRunAudit = async () => {
    try {
      const result = await runAudit();
      if (result?.audit_id) {
        setSelectedAuditId(result.audit_id);
        refetchHistory();
      }
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleRunFullAudit = async () => {
    const result = await runFullAudit();
    if (result) {
      refetchHistory();
    }
  };

  // Extract falsification criteria from latest audit metrics snapshot
  const falsificationCriteria: FalsificationCriterion[] = useMemo(() => {
    if (!currentAudit?.metrics_snapshot) return [];
    const snapshot = currentAudit.metrics_snapshot as Record<string, unknown>;
    return (snapshot.falsification_criteria as FalsificationCriterion[]) || [];
  }, [currentAudit]);

  const anyAuditRunning = isRunning || isFullAuditRunning;

  const handleSelectAudit = (auditId: string) => {
    setSelectedAuditId(auditId);
    setActiveTab('overview');
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoria do Sistema</h1>
          <p className="text-muted-foreground">
            Análise completa do CyberShield pela persona Ana, auditora especialista em SaaS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchHistory()}
            disabled={historyLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={handleRunAudit} disabled={anyAuditRunning}>
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ana...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Só Ana
              </>
            )}
          </Button>
          <Button onClick={handleRunFullAudit} disabled={anyAuditRunning}>
            {isFullAuditRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Auditoria Completa...
              </>
            ) : (
              <>
                <Skull className="h-4 w-4 mr-2" />
                Auditoria Completa
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Timeline Sidebar */}
        <div className="lg:col-span-1">
          <AuditTimeline 
            audits={auditHistory || []} 
            selectedAuditId={selectedAuditId || latestAudit?.id}
            onSelectAudit={handleSelectAudit}
          />
        </div>

        {/* Audit Details */}
        <div className="lg:col-span-3 space-y-6">
          {!currentAudit ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma auditoria encontrada</h3>
              <p className="text-muted-foreground mb-4">
                Execute sua primeira auditoria para ver a análise completa do sistema
              </p>
              <Button onClick={handleRunFullAudit} disabled={anyAuditRunning}>
                {anyAuditRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Skull className="h-4 w-4 mr-2" />
                    Executar Primeira Auditoria
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="overview" className="gap-1 text-xs">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Visão Geral</span>
                </TabsTrigger>
                <TabsTrigger value="dimensions" className="gap-1 text-xs">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Dimensões</span>
                </TabsTrigger>
                <TabsTrigger value="executive" className="gap-1 text-xs">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Executivo</span>
                </TabsTrigger>
                <TabsTrigger value="redteam" className="gap-1 text-xs">
                  <Skull className="h-4 w-4" />
                  <span className="hidden sm:inline">Red Team</span>
                </TabsTrigger>
                <TabsTrigger value="gap" className="gap-1 text-xs">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Gap</span>
                </TabsTrigger>
                <TabsTrigger value="falsification" className="gap-1 text-xs">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline">Falsificação</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-6">
                <AuditRadarChart audit={currentAudit} previousAudit={previousAudit} />
              </TabsContent>

              <TabsContent value="dimensions" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(currentAudit.dimensions).map(([key, dimension]) => (
                    <AuditDimensionCard 
                      key={key}
                      dimensionKey={key}
                      dimension={dimension}
                      previousScore={previousAudit?.dimensions[key as keyof typeof previousAudit.dimensions]?.score}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="executive" className="mt-6">
                <AuditExecutiveSummary audit={currentAudit} />
              </TabsContent>

              <TabsContent value="redteam" className="mt-6">
                <RedTeamSummary assessment={latestRedTeam || null} />
              </TabsContent>

              <TabsContent value="gap" className="mt-6">
                <ConfidenceGapChart latestGap={latestConfidenceGap || null} trendData={confidenceGapTrend || []} />
              </TabsContent>

              <TabsContent value="falsification" className="mt-6">
                <FalsificationCriteria criteria={falsificationCriteria} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
