import { useState } from 'react';
import { useActionCenter } from '@/hooks/useActionCenter';
import { useActionCenterHistory, ActionHistoryItem } from '@/hooks/useActionCenterHistory';
import { useInsightFeedback, FeedbackType } from '@/hooks/useInsightFeedback';
import { ActionCard, ActionCenterSection, EmptyActionCenter } from '@/components/action-center';
import { ActionCenterOverview } from '@/components/action-center/ActionCenterOverview';
import { NextBestAction } from '@/components/action-center/NextBestAction';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RefreshCw, Target, ArrowRight, Clock, History, CheckCircle2, XCircle, Bot, User, ChevronDown, ShieldCheck, BookOpen, AlertTriangle, Loader2, ThumbsUp, ThumbsDown, Ban, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, format, ptBR } from '@/lib/date-utils';
import { explainInsight, explainEffectiveness, type EffectivenessStatus } from '@/lib/explain-insight';
import { getEducationalMoment } from '@/lib/education-mapping';
import { mapInsightToAction } from '@/lib/insight-action-mapping';

function EffectivenessBadge({ status }: { status: EffectivenessStatus }) {
  const config = {
    resolved: { icon: CheckCircle2, className: 'bg-green-100 text-green-700 border-green-200', label: 'Resolvido' },
    partial: { icon: AlertTriangle, className: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Parcial' },
    failed: { icon: XCircle, className: 'bg-red-100 text-red-700 border-red-200', label: 'Não resolvido' },
    pending: { icon: Loader2, className: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Verificando' },
    unknown: { icon: AlertTriangle, className: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Indeterminado' },
  };
  
  const { icon: Icon, className, label } = config[status] || config.unknown;
  
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'pending' ? 'animate-spin' : ''}`} />
      {label}
    </Badge>
  );
}

function HistoryItemCard({ item }: { item: ActionHistoryItem }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const [showEffectiveness, setShowEffectiveness] = useState(false);
  const { feedback, hasFeedback, submitFeedback } = useInsightFeedback(item.id);
  
  const handleFeedback = (type: FeedbackType) => {
    submitFeedback.mutate({ insightId: item.id, feedbackType: type });
  };
  
  const isResolved = item.status === 'resolved';
  const wasAutoExecuted = item.auto_action_executed;
  
  // Get explanation and educational content
  const mapping = mapInsightToAction(item.insight_type);
  const explanation = explainInsight(item, mapping);
  const education = getEducationalMoment(item.insight_type);
  
  // Get effectiveness data from first action (if exists)
  const action = item.ai_actions?.[0];
  const effectivenessStatus = (action?.effectiveness_status || item.final_outcome || 'pending') as EffectivenessStatus;
  const effectivenessEvidence = action?.effectiveness_evidence as Record<string, unknown> | null;
  const effectivenessExplanation = explainEffectiveness(
    effectivenessStatus,
    item.insight_type,
    effectivenessEvidence || undefined
  );
  
  const riskColors: Record<string, string> = {
    critical: 'text-red-600 bg-red-50 border-red-200',
    high: 'text-orange-600 bg-orange-50 border-orange-200',
    medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    low: 'text-blue-600 bg-blue-50 border-blue-200',
  };
  
  return (
    <Card className="border-l-4 overflow-hidden" style={{ borderLeftColor: isResolved ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(var(--muted))' }}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {isResolved ? (
                  <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium">{explanation.human_title}</span>
                <Badge variant={isResolved ? 'default' : 'secondary'} className="shrink-0">
                  {isResolved ? 'Resolvido' : 'Ignorado'}
                </Badge>
                <EffectivenessBadge status={effectivenessStatus} />
              </div>
              
              {/* Human explanation */}
              <p className="text-sm text-muted-foreground mb-2">
                {explanation.what_happened}
              </p>
              
              {/* Effectiveness result */}
              <p className="text-sm font-medium" style={{ 
                color: effectivenessStatus === 'resolved' ? 'hsl(142.1 76.2% 36.3%)' 
                  : effectivenessStatus === 'failed' ? 'hsl(0 84.2% 60.2%)' 
                  : effectivenessStatus === 'partial' ? 'hsl(38 92% 50%)' 
                  : 'inherit' 
              }}>
                {effectivenessExplanation.human_text}
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge 
                variant="outline" 
                className={`capitalize ${riskColors[mapping.risk] || ''}`}
              >
                {mapping.risk}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {wasAutoExecuted ? 'Auto' : 'Manual'}
              </Badge>
            </div>
          </div>
          
          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-3">
            {item.agent && (
              <span className="flex items-center gap-1">
                <span className="font-medium">{item.agent.agent_name}</span>
                {item.agent.hostname && (
                  <span>({item.agent.hostname})</span>
                )}
              </span>
            )}
            
            <span className="flex items-center gap-1">
              {wasAutoExecuted ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
              <span>{wasAutoExecuted ? 'Sistema' : 'Manual'}</span>
            </span>
            
            {item.resolved_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(item.resolved_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            )}
            
            <span className="text-xs px-2 py-0.5 bg-muted rounded">
              Política: {explanation.policy_reference}
            </span>
          </div>
          
          {/* Expandable sections */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Collapsible open={showEducation} onOpenChange={setShowEducation}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  <BookOpen className="h-3 w-3" />
                  Por que é importante?
                  <ChevronDown className={`h-3 w-3 transition-transform ${showEducation ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-600" />
                    {education.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">{education.explanation}</p>
                  <p className="text-sm">
                    <strong>Por que importa:</strong> {education.why_it_matters}
                  </p>
                  {education.what_to_do_next && (
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Próximos passos:</strong> {education.what_to_do_next}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            {effectivenessEvidence && Object.keys(effectivenessEvidence).length > 0 && (
              <Collapsible open={showEffectiveness} onOpenChange={setShowEffectiveness}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Ver verificação
                    <ChevronDown className={`h-3 w-3 transition-transform ${showEffectiveness ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <h4 className="font-medium text-xs mb-2 text-muted-foreground">Evidências da verificação</h4>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-background p-2 rounded border">
                      {JSON.stringify(effectivenessEvidence, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {item.evidence && (
              <Collapsible open={showDetails} onOpenChange={setShowDetails}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Ver evidências originais
                    <ChevronDown className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <h4 className="font-medium text-xs mb-2 text-muted-foreground">Evidências técnicas originais</h4>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono bg-background p-2 rounded border">
                      {JSON.stringify(item.evidence, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
          
          {/* CICLO 8: Feedback buttons */}
          <div className="flex items-center gap-2 border-t pt-3 mt-3">
            <span className="text-xs text-muted-foreground">Esta ação foi útil?</span>
            {hasFeedback ? (
              <Badge variant="outline" className="text-xs">
                {feedback?.feedback_type === 'useful' && '👍 Útil'}
                {feedback?.feedback_type === 'noise' && '👎 Ruído'}
                {feedback?.feedback_type === 'false_positive' && '🚫 Falso positivo'}
              </Badge>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs gap-1 hover:bg-green-50 hover:text-green-700"
                  onClick={() => handleFeedback('useful')}
                  disabled={submitFeedback.isPending}
                >
                  <ThumbsUp className="h-3 w-3" /> Útil
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-7 text-xs gap-1 hover:bg-yellow-50 hover:text-yellow-700"
                  onClick={() => handleFeedback('noise')}
                  disabled={submitFeedback.isPending}
                >
                  <ThumbsDown className="h-3 w-3" /> Ruído
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-7 text-xs gap-1 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleFeedback('false_positive')}
                  disabled={submitFeedback.isPending}
                >
                  <Ban className="h-3 w-3" /> Falso positivo
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ActionCenterDashboard() {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const { data, isLoading, refetch, isRefetching } = useActionCenter();
  const { data: historyData, isLoading: historyLoading } = useActionCenterHistory();

  const totalActions = (data?.urgent?.length || 0) + (data?.recommended?.length || 0);
  const healthyCount = data?.healthy_count || 0;
  const offlineCount = data?.offline_count || 0;
  const totalAgents = data?.total_agents || 0;
  const historyCount = historyData?.length || 0;

  const lastUpdated = data?.generated_at 
    ? formatDistanceToNow(new Date(data.generated_at), { addSuffix: true, locale: ptBR })
    : null;

  // Filter actions by search term
  const filterItems = (items: typeof data.urgent) => {
    if (!items || !searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item => 
      item.agent_name?.toLowerCase().includes(term) ||
      item.hostname?.toLowerCase().includes(term) ||
      item.title?.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term) ||
      item.trigger_type?.toLowerCase().includes(term)
    );
  };

  const filteredUrgent = filterItems(data?.urgent);
  const filteredRecommended = filterItems(data?.recommended);
  const filteredInformational = filterItems(data?.informational);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Central de Ações</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {totalActions > 0 ? (
                <span>{totalActions} {totalActions === 1 ? 'ação pendente' : 'ações pendentes'}</span>
              ) : (
                <span>Gerencie ações de segurança</span>
              )}
              {lastUpdated && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Atualizado {lastUpdated}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/playbooks">
              Ver Playbooks
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Pendentes
            {totalActions > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                {totalActions}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Resolvidos
            {historyCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {historyCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="mt-6">
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-8 w-48" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          {!isLoading && data && (
            <div className="space-y-6">
              {/* Next Best Action Banner - Premium UX */}
              {totalActions > 0 && (
                <NextBestAction onExecute={() => refetch()} />
              )}

              {/* Overview Cards - Always Visible */}
              <ActionCenterOverview
                urgentCount={data.urgent?.length || 0}
                recommendedCount={data.recommended?.length || 0}
                healthyCount={healthyCount}
                offlineCount={offlineCount}
                totalAgents={totalAgents}
              />

              {/* Search Bar - Positioned above alerts */}
              {totalActions > 0 && (
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por agente, tipo de alerta..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              )}

              {/* Empty State - Only when no actions */}
              {totalActions === 0 && (data.informational?.length || 0) === 0 && (
                <EmptyActionCenter 
                  healthyCount={healthyCount}
                  offlineCount={offlineCount}
                  totalAgents={totalAgents}
                />
              )}

              {/* Urgent Actions */}
              {filteredUrgent && filteredUrgent.length > 0 && (
                <ActionCenterSection type="urgent" count={filteredUrgent.length}>
                  {filteredUrgent.map((item) => (
                    <ActionCard 
                      key={item.item_id} 
                      item={item}
                      onExecuted={() => refetch()}
                    />
                  ))}
                </ActionCenterSection>
              )}

              {/* Recommended Actions */}
              {filteredRecommended && filteredRecommended.length > 0 && (
                <ActionCenterSection type="recommended" count={filteredRecommended.length}>
                  {filteredRecommended.map((item) => (
                    <ActionCard 
                      key={item.item_id} 
                      item={item}
                      onExecuted={() => refetch()}
                    />
                  ))}
                </ActionCenterSection>
              )}

              {/* Informational Actions */}
              {filteredInformational && filteredInformational.length > 0 && (
                <ActionCenterSection type="informational" count={filteredInformational.length}>
                  {filteredInformational.map((item) => (
                    <ActionCard 
                      key={item.item_id} 
                      item={item}
                      compact
                      onExecuted={() => refetch()}
                    />
                  ))}
                </ActionCenterSection>
              )}

              {/* Healthy Status Footer - Only when there are actions */}
              {healthyCount > 0 && totalActions > 0 && (
                <div className="flex items-center justify-center gap-2 text-green-600 py-4 border-t">
                  <span className="text-lg">🟢</span>
                  <span className="text-sm">
                    {healthyCount} {healthyCount === 1 ? 'computador' : 'computadores'} com ambiente estável
                  </span>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          {historyLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {!historyLoading && historyData && (
            <div className="space-y-4">
              {historyData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhuma ação resolvida ainda</p>
                  <p className="text-sm">Quando você executar ou ignorar ações, elas aparecerão aqui.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Mostrando últimas {historyData.length} ações
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {historyData.filter(i => i.status === 'resolved').length} resolvidas
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <XCircle className="h-4 w-4" />
                        {historyData.filter(i => i.status === 'ignored').length} ignoradas
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {historyData.map((item) => (
                      <HistoryItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
