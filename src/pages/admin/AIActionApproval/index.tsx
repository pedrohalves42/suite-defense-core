import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Brain } from 'lucide-react';
import { AutoApprovalPanel } from '@/components/admin/AutoApprovalPanel';
import { RollbackTestPanel } from '@/components/admin/RollbackTestPanel';
import { useAIActionApprovalData } from './hooks/useAIActionApprovalData';
import { RecentInsightsCard } from './components/RecentInsightsCard';
import { PendingActionCard } from './components/PendingActionCard';
import { ApprovalDialog } from './components/ApprovalDialog';

export default function AIActionApproval() {
  const {
    pendingActions, recentInsights, isLoading, isAnalyzing,
    executingActions, approvalDialogOpen, setApprovalDialogOpen,
    selectedRiskLevel, approvalNotes, setApprovalNotes,
    reviewedDetails, setReviewedDetails, isSuspiciousPattern,
    approveAction, checkBlastRadius,
    getActionConfig, handleApproveClick, handleConfirmApproval, handleReject, handleAnalyzeNow,
  } = useAIActionApprovalData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AutoApprovalPanel />
      <RollbackTestPanel />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Decisões Automáticas</h1>
          <p className="text-muted-foreground mt-2">
            O CyberShield pode tomar decisões automáticas para proteger sua empresa. Todas são registradas e podem ser revisadas aqui.
          </p>
        </div>
        <Button onClick={handleAnalyzeNow} disabled={isAnalyzing} className="gap-2">
          {isAnalyzing ? <><Loader2 className="h-4 w-4 animate-spin" />Analisando...</> : <><Brain className="h-4 w-4" />Verificar Agora</>}
        </Button>
      </div>

      <RecentInsightsCard insights={recentInsights || []} />

      {(!recentInsights || recentInsights.length === 0) && pendingActions?.length === 0 && (
        <Alert className="border-dashed">
          <Brain className="h-4 w-4" />
          <AlertTitle>Nenhuma descoberta ainda</AlertTitle>
          <AlertDescription className="mt-2">
            O sistema analisa seus computadores automaticamente todos os dias às 09:00. Você também pode clicar em "Verificar Agora" para executar uma análise manual.
          </AlertDescription>
        </Alert>
      )}

      {pendingActions && pendingActions.length > 0 && (
        <h2 className="text-xl font-semibold mb-4">Decisões Aguardando Sua Aprovação</h2>
      )}

      <div className="grid gap-4">
        {pendingActions?.map((action) => (
          <PendingActionCard
            key={action.id}
            action={action}
            config={getActionConfig(action.action_type)}
            isExecuting={executingActions.has(action.id)}
            isSuspiciousPattern={isSuspiciousPattern}
            isPending={approveAction.isPending}
            isBlastRadiusPending={checkBlastRadius.isPending}
            onApprove={handleApproveClick}
            onReject={handleReject}
          />
        ))}
      </div>

      <ApprovalDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        isSuspiciousPattern={isSuspiciousPattern}
        selectedRiskLevel={selectedRiskLevel}
        approvalNotes={approvalNotes}
        setApprovalNotes={setApprovalNotes}
        reviewedDetails={reviewedDetails}
        setReviewedDetails={setReviewedDetails}
        isPending={approveAction.isPending}
        onConfirm={handleConfirmApproval}
      />
    </div>
  );
}
