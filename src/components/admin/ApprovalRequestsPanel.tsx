/**
 * Approval Requests Panel - Two-Man-Rule Approvals
 * Fase 1: Panel for pending approval requests
 */

import { usePendingApprovalRequests, useSubmitApproval, ACTION_TYPE_LABELS, ACTION_TYPE_SEVERITY } from '@/hooks/useApprovalRequests';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, XCircle, Clock, Shield, Users, 
  AlertTriangle, ChevronRight, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { differenceInMinutes } from 'date-fns';
import { Link } from 'react-router-dom';

interface ApprovalRequestsPanelProps {
  compact?: boolean;
  className?: string;
  maxItems?: number;
}

export function ApprovalRequestsPanel({ 
  compact = false, 
  className,
  maxItems = 5 
}: ApprovalRequestsPanelProps) {
  const { data: requests, isLoading } = usePendingApprovalRequests();
  const submitApproval = useSubmitApproval();

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingRequests = requests?.slice(0, maxItems) || [];
  const hasMore = (requests?.length || 0) > maxItems;

  const handleApprove = (requestId: string) => {
    submitApproval.mutate({ requestId, decision: 'approved' });
  };

  const handleReject = (requestId: string, reason?: string) => {
    submitApproval.mutate({ requestId, decision: 'rejected', reason });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const minutes = differenceInMinutes(new Date(expiresAt), new Date());
    if (minutes < 0) return { text: 'Expirado', urgent: true };
    if (minutes < 30) return { text: `${minutes}min`, urgent: true };
    if (minutes < 60) return { text: `${minutes}min`, urgent: false };
    return { text: `${Math.floor(minutes / 60)}h`, urgent: false };
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'high': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      default: return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    }
  };

  if (pendingRequests.length === 0) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
          <p className="text-sm font-medium">Nenhuma aprovação pendente</p>
          <p className="text-xs text-muted-foreground">
            Todas as solicitações foram processadas
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Aprovações Pendentes
              {pendingRequests.length > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-xs animate-pulse">
                  {requests?.length || 0}
                </Badge>
              )}
            </CardTitle>
            {!compact && (
              <CardDescription className="text-xs">
                Regra Two-Man: 2 aprovadores necessários
              </CardDescription>
            )}
          </div>
          <Link to="/admin/approval-requests">
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todas
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="popLayout">
          <div className="space-y-3">
            {pendingRequests.map((request, idx) => {
              const severity = ACTION_TYPE_SEVERITY[request.action_type as keyof typeof ACTION_TYPE_SEVERITY] || 'low';
              const timeRemaining = getTimeRemaining(request.expires_at);
              const approvalProgress = (request.current_approvers / request.required_approvers) * 100;

              return (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    timeRemaining.urgent ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/20"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Action Type */}
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs", getSeverityColor(severity))}
                        >
                          {ACTION_TYPE_LABELS[request.action_type as keyof typeof ACTION_TYPE_LABELS] || request.action_type}
                        </Badge>
                        {timeRemaining.urgent && (
                          <Badge variant="destructive" className="text-xs animate-pulse">
                            <Clock className="h-3 w-3 mr-1" />
                            {timeRemaining.text}
                          </Badge>
                        )}
                      </div>

                      {/* Target Agent */}
                      {request.target_agent_id && (
                        <p className="text-xs text-muted-foreground mb-2">
                          Agente: {request.target_agent_id.slice(0, 8)}...
                        </p>
                      )}

                      {/* Approvers Progress */}
                      <div className="flex items-center gap-2 mb-2">
                        <Progress value={approvalProgress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {request.current_approvers}/{request.required_approvers}
                        </span>
                      </div>

                      {/* Requester */}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>
                          Solicitado {formatDistanceToNow(new Date(request.created_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {!compact && (
                      <div className="flex flex-col gap-1.5">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(request.id)}
                          disabled={submitApproval.isPending}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-500/30 text-red-600 hover:bg-red-500/10"
                          onClick={() => handleReject(request.id)}
                          disabled={submitApproval.isPending}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>

        {hasMore && (
          <div className="mt-3 text-center">
            <Link to="/admin/approval-requests">
              <Button variant="ghost" size="sm" className="text-xs">
                Ver mais {(requests?.length || 0) - maxItems} aprovações
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
