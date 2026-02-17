import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Play, BarChart3, FileText, RefreshCw, Shield, TrendingUp, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
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

  // Get global status based on audit scores
  const getGlobalStatus = () => {
    if (!currentAudit) {
      return {
        emoji: '⚪',
        title: 'Sem dados',
        description: 'Execute uma auditoria para ver o status do sistema.',
        variant: 'neutral' as const
      };
    }
    
    const score = currentAudit.overall_score || 0;
    const confidenceGap = latestConfidenceGap?.confidence_gap || 0;
    
    if (score >= 80 && confidenceGap >= 40) {
      return {
        emoji: '🟢',
        title: 'Sistema saudável',
        description: 'A análise indica que seu sistema está bem protegido.',
        variant: 'success' as const
      };
    }
    if (score >= 60 || confidenceGap >= 20) {
      return {
        emoji: '🟡',
        title: 'Atenção recomendada',
        description: 'Existem pontos de melhoria que merecem sua verificação.',
        variant: 'warning' as const
      };
    }
    return {
      emoji: '🔴',
      title: 'Ação necessária',
      description: 'A análise encontrou vulnerabilidades que precisam ser corrigidas.',
      variant: 'danger' as const
    };
  };

  const globalStatus = getGlobalStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Verificação de Segurança
            </h2>
            <p className="text-sm text-muted-foreground">
              Análise completa do sistema para garantir sua proteção
            </p>
          </div>
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
                Analisando...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Análise Rápida
              </>
            )}
          </Button>
          <Button onClick={handleRunFullAudit} disabled={anyAuditRunning}>
            {isFullAuditRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verificação Completa...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-2" />
                Verificação Completa
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 🔐 CAMADA 1: Status Global */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn(
          "border-2",
          globalStatus.variant === 'success' && "bg-green-500/5 border-green-500/30",
          globalStatus.variant === 'warning' && "bg-amber-500/5 border-amber-500/30",
          globalStatus.variant === 'danger' && "bg-red-500/5 border-red-500/30",
          globalStatus.variant === 'neutral' && "bg-muted/50 border-border"
        )}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-4 rounded-full",
                globalStatus.variant === 'success' && "bg-green-500/10",
                globalStatus.variant === 'warning' && "bg-amber-500/10",
                globalStatus.variant === 'danger' && "bg-red-500/10",
                globalStatus.variant === 'neutral' && "bg-muted"
              )}>
                <Shield className={cn(
                  "h-10 w-10",
                  globalStatus.variant === 'success' && "text-green-500",
                  globalStatus.variant === 'warning' && "text-amber-500",
                  globalStatus.variant === 'danger' && "text-red-500",
                  globalStatus.variant === 'neutral' && "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <h2 className={cn(
                  "text-xl font-bold",
                  globalStatus.variant === 'success' && "text-green-600 dark:text-green-400",
                  globalStatus.variant === 'warning' && "text-amber-600 dark:text-amber-400",
                  globalStatus.variant === 'danger' && "text-red-600 dark:text-red-400",
                  globalStatus.variant === 'neutral' && "text-muted-foreground"
                )}>
                  {globalStatus.emoji} {globalStatus.title}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {globalStatus.description}
                </p>
              </div>
              {currentAudit && (
                <div className="text-right">
                  <div className={cn(
                    "text-3xl font-bold",
                    currentAudit.overall_score >= 80 && "text-green-600",
                    currentAudit.overall_score >= 60 && currentAudit.overall_score < 80 && "text-amber-600",
                    currentAudit.overall_score < 60 && "text-red-600"
                  )}>
                    {currentAudit.overall_score}%
                  </div>
                  <div className="text-xs text-muted-foreground">Pontuação geral</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

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
              <h3 className="text-lg font-medium">Nenhuma verificação encontrada</h3>
              <p className="text-muted-foreground mb-4">
                Execute sua primeira verificação para ver a análise completa do sistema
              </p>
              <Button onClick={handleRunFullAudit} disabled={anyAuditRunning}>
                {anyAuditRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Executar Primeira Verificação
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {/* CAMADA 2: Tabs reduzidas de 6 para 4 - Linguagem humanizada */}
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview" className="gap-1 text-xs">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Visão Geral</span>
                </TabsTrigger>
                <TabsTrigger value="details" className="gap-1 text-xs">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Detalhes</span>
                </TabsTrigger>
                <TabsTrigger value="resistance" className="gap-1 text-xs">
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Teste de Resistência</span>
                </TabsTrigger>
                <TabsTrigger value="confidence" className="gap-1 text-xs">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Nível de Confiança</span>
                </TabsTrigger>
              </TabsList>

              {/* Visão Geral - combina radar + sumário executivo + verificação de consistência */}
              <TabsContent value="overview" className="space-y-6 mt-6">
                <AuditRadarChart audit={currentAudit} previousAudit={previousAudit} />
                <AuditExecutiveSummary audit={currentAudit} />
                {falsificationCriteria.length > 0 && (
                  <FalsificationCriteria criteria={falsificationCriteria} />
                )}
              </TabsContent>

              {/* Detalhes - dimensões individuais */}
              <TabsContent value="details" className="mt-6">
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

              {/* Teste de Resistência - Red Team humanizado */}
              <TabsContent value="resistance" className="mt-6">
                <RedTeamSummary assessment={latestRedTeam || null} />
              </TabsContent>

              {/* Nível de Confiança - Gap humanizado */}
              <TabsContent value="confidence" className="mt-6">
                <ConfidenceGapChart latestGap={latestConfidenceGap || null} trendData={confidenceGapTrend || []} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
