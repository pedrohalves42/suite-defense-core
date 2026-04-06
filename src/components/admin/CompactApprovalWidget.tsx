/**
 * Compact Approval Widget with Real-Time Countdown
 * For Dashboard integration
 */

import { usePendingApprovalRequests, useSubmitApproval, ACTION_TYPE_LABELS, ACTION_TYPE_SEVERITY } from '@/hooks/useApprovalRequests';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, XCircle, Clock, Users, 
  ChevronRight, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useRealTimeCountdown } from '@/hooks/useRealTimeCountdown';

interface CompactApprovalWidgetProps {
  className?: string;
  maxItems?: number;
}

function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const countdown = useRealTimeCountdown(expiresAt);

  const getBadgeStyles = () => {
    switch (countdown.urgency) {
      case 'expired':
        return 'bg-muted text-muted-foreground';
      case 'danger':
        return 'bg-red-500/20 text-red-600 border-red-500/30 animate-pulse';
      case 'warning':
        return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
      default:
        return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  return (
    <Badge variant="outline" className={cn("text-xs font-mono", getBadgeStyles())}>
      <Clock className="h-3 w-3 mr-1" />
      {countdown.text}
    </Badge>
  );
}

function ApprovalItem({ request, onApprove, onReject, isPending }: {
  request: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  const countdown = useRealTimeCountdown(request.expires_at);
  const severity = ACTION_TYPE_SEVERITY[request.action_type as keyof typeof ACTION_TYPE_SEVERITY] || 'low';
  const approvalProgress = (request.current_approvers / request.required_approvers) * 100;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'high': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      default: return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "p-3 rounded-lg border transition-all",
        countdown.urgency === 'danger' 
          ? "border-red-500/40 bg-red-500/5 shadow-sm shadow-red-500/10" 
          : countdown.urgency === 'warning'
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-border bg-card/50"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant="outline" 
              className={cn("text-xs", getSeverityColor(severity))}
            >
              {ACTION_TYPE_LABELS[request.action_type as keyof typeof ACTION_TYPE_LABELS] || request.action_type}
            </Badge>
            <CountdownBadge expiresAt={request.expires_at} />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Progress value={approvalProgress} className="h-1.5 flex-1 max-w-[100px]" />
            <span className="text-xs text-muted-foreground">
              {request.current_approvers}/{request.required_approvers}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
            onClick={onApprove}
            disabled={isPending || countdown.isExpired}
          >
            <CheckCircle className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs border-red-500/30 text-red-600 hover:bg-red-500/10"
            onClick={onReject}
            disabled={isPending || countdown.isExpired}
          >
            <XCircle className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function CompactApprovalWidget({ 
  className,
  maxItems = 3 
}: CompactApprovalWidgetProps) {
  const { data: requests, isLoading } = usePendingApprovalRequests();
  const submitApproval = useSubmitApproval();

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingRequests = requests?.slice(0, maxItems) || [];
  const totalPending = requests?.length || 0;

  if (pendingRequests.length === 0) {
    return null; // Don't show widget if no pending approvals
  }

  return (
    <Card className={cn("border-primary/20 bg-gradient-to-br from-primary/5 to-transparent", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Aprovações Pendentes
            <Badge variant="destructive" className="h-5 px-1.5 text-xs animate-pulse">
              {totalPending}
            </Badge>
          </CardTitle>
          <Link to="/admin/approval-requests">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              Ver todas
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <ApprovalItem
                key={request.id}
                request={request}
                onApprove={() => submitApproval.mutate({ requestId: request.id, decision: 'approved' })}
                onReject={() => submitApproval.mutate({ requestId: request.id, decision: 'rejected' })}
                isPending={submitApproval.isPending}
              />
            ))}
          </div>
        </AnimatePresence>

        {totalPending > maxItems && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <Link to="/admin/approval-requests" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              +{totalPending - maxItems} aprovações aguardando
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
