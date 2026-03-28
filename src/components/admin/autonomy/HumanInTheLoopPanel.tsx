/**
 * Human-in-the-Loop Panel
 * Shows pending critical AI actions that require human approval
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useSubmitApproval } from '@/hooks/useApprovalRequests';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, CheckCircle, XCircle, Clock, UserCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from '@/lib/date-utils';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface PendingApproval {
  id: string;
  tenant_id: string;
  action_type: string;
  action_payload: any;
  status: string;
  required_approvers: number;
  current_approvers: number;
  expires_at: string;
  created_at: string;
  playbook_execution_id: string | null;
  playbook_name: string | null;
  severity: string | null;
  risk_score: number | null;
  trigger_source: string | null;
  agent_name: string | null;
  hostname: string | null;
}

function usePendingCriticalApprovals() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['pending-critical-approvals', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('v_pending_critical_approvals' )
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as PendingApproval[];
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/30' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', border: 'border-yellow-500/30' },
  low: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
};

function ApprovalCard({ approval, onApprove, onReject, isPending }: {
  approval: PendingApproval;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const severity = approval.severity || 'medium';
  const styles = SEVERITY_STYLES[severity] || SEVERITY_STYLES.medium;
  const expiresIn = formatDistanceToNow(new Date(approval.expires_at), { addSuffix: true });
  const createdAgo = formatDistanceToNow(new Date(approval.created_at), { addSuffix: true });

  const displayName = approval.playbook_name || 
    (approval.action_payload as Record<string, unknown>)?.playbook_name || 
    approval.action_type;

  return (
    <div className={cn('rounded-lg border-2 p-4 space-y-3', styles.border, styles.bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className={cn('h-5 w-5 shrink-0', styles.text)} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{String(displayName)}</p>
            {approval.agent_name && (
              <p className="text-xs text-muted-foreground truncate">
                {approval.agent_name} ({approval.hostname})
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={cn('shrink-0', styles.text, styles.border)}>
          {severity.toUpperCase()}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Criado {createdAgo}
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Expira {expiresIn}
        </span>
        {approval.risk_score !== null && (
          <span>Risco: {(approval.risk_score * 100).toFixed(0)}%</span>
        )}
      </div>

      {approval.trigger_source && (
        <p className="text-xs text-muted-foreground">
          Gatilho: <span className="font-medium text-foreground">{approval.trigger_source}</span>
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          onClick={onApprove}
          disabled={isPending}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-red-500/30 text-red-600 hover:bg-red-500/10"
          onClick={onReject}
          disabled={isPending}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Rejeitar
        </Button>
      </div>
    </div>
  );
}

export function HumanInTheLoopPanel() {
  const { data: approvals, isLoading } = usePendingCriticalApprovals();
  const submitApproval = useSubmitApproval();

  const pendingCount = approvals?.length || 0;

  return (
    <Card className={cn(
      'border-2 transition-colors',
      pendingCount > 0 ? 'border-orange-500/50 shadow-orange-500/10 shadow-lg' : 'border-border'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCheck className="h-5 w-5 text-primary" />
            Human-in-the-Loop
          </CardTitle>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {pendingCount} pendente{pendingCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <CardDescription>
          Ações críticas da IA aguardando revisão humana
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : pendingCount === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500/50" />
            <p className="font-medium">Nenhuma ação pendente</p>
            <p className="text-sm mt-1">
              Todas as decisões críticas foram revisadas
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {approvals!.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={() => submitApproval.mutate({ requestId: approval.id, decision: 'approved' })}
                onReject={() => submitApproval.mutate({ requestId: approval.id, decision: 'rejected' })}
                isPending={submitApproval.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
