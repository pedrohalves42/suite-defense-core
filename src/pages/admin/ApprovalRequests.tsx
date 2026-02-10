/**
 * Approval Requests Page - Full Two-Man-Rule Management
 * Fase 1: Complete approval request management
 */

import { useState } from 'react';
import { usePendingApprovalRequests, useApprovalRequestHistory, useApprovalVotes, useSubmitApproval, ACTION_TYPE_LABELS, ACTION_TYPE_SEVERITY } from '@/hooks/useApprovalRequests';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, CheckCircle, XCircle, Clock, Search, 
  AlertTriangle, ChevronDown, ChevronRight, User, Shield,
  History, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, ptBR } from '@/lib/date-utils';
import { differenceInMinutes } from 'date-fns';

export default function ApprovalRequests() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [requestToReject, setRequestToReject] = useState<string | null>(null);

  const { data: pendingRequests, isLoading: loadingPending } = usePendingApprovalRequests();
  const { data: historyRequests, isLoading: loadingHistory } = useApprovalRequestHistory(100);
  const { data: selectedVotes } = useApprovalVotes(selectedRequest || '');
  const submitApproval = useSubmitApproval();

  const handleApprove = (requestId: string) => {
    submitApproval.mutate({ requestId, decision: 'approved' });
  };

  const openRejectDialog = (requestId: string) => {
    setRequestToReject(requestId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = () => {
    if (requestToReject) {
      submitApproval.mutate({ 
        requestId: requestToReject, 
        decision: 'rejected', 
        reason: rejectReason || undefined 
      });
      setRejectDialogOpen(false);
      setRequestToReject(null);
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const minutes = differenceInMinutes(new Date(expiresAt), new Date());
    if (minutes < 0) return { text: 'Expirado', urgent: true, expired: true };
    if (minutes < 30) return { text: `${minutes}min`, urgent: true, expired: false };
    if (minutes < 60) return { text: `${minutes}min`, urgent: false, expired: false };
    return { text: `${Math.floor(minutes / 60)}h ${minutes % 60}min`, urgent: false, expired: false };
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'high': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30';
      default: return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Aprovado</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/30">Rejeitado</Badge>;
      case 'expired':
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/30">Expirado</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  const filteredPending = pendingRequests?.filter(r => 
    r.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.target_agent_id?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const filteredHistory = historyRequests?.filter(r => 
    r.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.target_agent_id?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5" />
          Aprovações Two-Man-Rule
        </h1>
        <p className="text-muted-foreground text-xs">
          Gerencie aprovações que requerem múltiplos aprovadores
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por tipo de ação ou agente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pendentes
            {pendingRequests && pendingRequests.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-4">
          {loadingPending ? (
            <div className="space-y-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : filteredPending.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="font-semibold text-lg">Nenhuma aprovação pendente</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Todas as solicitações foram processadas
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredPending.map((request, idx) => {
                const severity = ACTION_TYPE_SEVERITY[request.action_type as keyof typeof ACTION_TYPE_SEVERITY] || 'low';
                const timeRemaining = getTimeRemaining(request.expires_at);
                const approvalProgress = (request.current_approvers / request.required_approvers) * 100;
                const isSelected = selectedRequest === request.id;

                return (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className={cn(
                      "transition-colors",
                      timeRemaining.urgent && !timeRemaining.expired && "border-red-500/30",
                      timeRemaining.expired && "opacity-60"
                    )}>
                      <CardContent className="p-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="flex-1">
                            {/* Header */}
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className={getSeverityColor(severity)}>
                                {ACTION_TYPE_LABELS[request.action_type as keyof typeof ACTION_TYPE_LABELS] || request.action_type}
                              </Badge>
                              {timeRemaining.urgent && (
                                <Badge variant="destructive" className={cn("text-xs", timeRemaining.expired ? "" : "animate-pulse")}>
                                  <Clock className="h-3 w-3 mr-1" />
                                  {timeRemaining.text}
                                </Badge>
                              )}
                              {!timeRemaining.urgent && (
                                <span className="text-xs text-muted-foreground">
                                  Expira em {timeRemaining.text}
                                </span>
                              )}
                            </div>

                            {/* Target */}
                            {request.target_agent_id && (
                              <p className="text-sm mb-2">
                                <span className="text-muted-foreground">Agente alvo: </span>
                                <span className="font-mono">{request.target_agent_id}</span>
                              </p>
                            )}

                            {/* Progress */}
                            <div className="flex items-center gap-3 mb-2">
                              <Progress value={approvalProgress} className="h-2 flex-1 max-w-xs" />
                              <span className="text-sm font-medium">
                                {request.current_approvers}/{request.required_approvers} aprovadores
                              </span>
                            </div>

                            {/* Metadata */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Solicitado {formatDistanceToNow(new Date(request.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                              <span className="font-mono">{request.id.slice(0, 8)}</span>
                            </div>

                            {/* Expand for votes */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-xs"
                              onClick={() => setSelectedRequest(isSelected ? null : request.id)}
                            >
                              {isSelected ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                              {isSelected ? 'Ocultar votos' : 'Ver votos'}
                            </Button>

                            {/* Votes detail */}
                            <AnimatePresence>
                              {isSelected && selectedVotes && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-3 p-3 rounded-lg bg-muted/30 border"
                                >
                                  {selectedVotes.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Nenhum voto registrado ainda</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {selectedVotes.map((vote) => (
                                        <div key={vote.id} className="flex items-center justify-between text-xs">
                                          <span className="font-mono">{vote.approved_by.slice(0, 8)}...</span>
                                          <Badge variant={vote.decision === 'approved' ? 'default' : 'destructive'} className="text-xs">
                                            {vote.decision === 'approved' ? 'Aprovou' : 'Rejeitou'}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Actions */}
                          <div className="flex lg:flex-col gap-2">
                            <Button
                              className="flex-1 lg:flex-none bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(request.id)}
                              disabled={submitApproval.isPending || timeRemaining.expired}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Aprovar
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 lg:flex-none border-red-500/30 text-red-600 hover:bg-red-500/10"
                              onClick={() => openRejectDialog(request.id)}
                              disabled={submitApproval.isPending || timeRemaining.expired}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Rejeitar
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {loadingHistory ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold">Nenhum histórico encontrado</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  As aprovações processadas aparecerão aqui
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <ScrollArea className="h-[600px]">
                <div className="divide-y">
                  {filteredHistory.map((request) => {
                    const severity = ACTION_TYPE_SEVERITY[request.action_type as keyof typeof ACTION_TYPE_SEVERITY] || 'low';

                    return (
                      <div key={request.id} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={cn("text-xs", getSeverityColor(severity))}>
                                {ACTION_TYPE_LABELS[request.action_type as keyof typeof ACTION_TYPE_LABELS] || request.action_type}
                              </Badge>
                              {getStatusBadge(request.status)}
                            </div>
                            {request.target_agent_id && (
                              <p className="text-xs text-muted-foreground">
                                Agente: {request.target_agent_id.slice(0, 8)}...
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                            <p className="font-mono">{request.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Solicitação</DialogTitle>
            <DialogDescription>
              Forneça um motivo para a rejeição (opcional)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo da rejeição..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
