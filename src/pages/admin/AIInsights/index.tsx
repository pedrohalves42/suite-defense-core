import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Brain, AlertTriangle, Info, CheckCircle, Clock, Shield, XCircle } from "lucide-react";
import { InsightsTrendChart } from "@/components/admin/InsightsTrendChart";
import { FeedbackStatsCard } from "@/components/admin/FeedbackStatsCard";
import { AIApprovalMetrics } from "@/components/admin/AIApprovalMetrics";
import { DismissInsightDialog } from "@/components/insights/DismissInsightDialog";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAIInsightsData } from "./hooks/useAIInsightsData";
import { InsightCard } from "./components/InsightCard";

export default function AIInsights() {
  const {
    isLoading, stats, pendingInsights, acknowledgedInsights,
    acknowledgeMutation, acknowledgeAllMutation, executeSolutionMutation,
    dismissDialogOpen, setDismissDialogOpen,
    selectedInsightForDismiss, setSelectedInsightForDismiss,
  } = useAIInsightsData();

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted rounded"></div>)}
          </div>
        </div>
      </div>
    );
  }

  const getGlobalStatus = () => {
    if (stats.critical > 0) return { emoji: '🔴', title: 'Ação urgente necessária', description: `${stats.critical} aviso${stats.critical > 1 ? 's' : ''} crítico${stats.critical > 1 ? 's' : ''} precisam da sua atenção imediata.`, variant: 'danger' as const };
    if (stats.warning > 0) return { emoji: '🟡', title: 'Avisos pendentes', description: `${stats.warning} aviso${stats.warning > 1 ? 's' : ''} merecem sua verificação.`, variant: 'warning' as const };
    return { emoji: '🟢', title: 'Tudo sob controle', description: 'Nenhum aviso urgente no momento. Continue monitorando.', variant: 'success' as const };
  };

  const globalStatus = getGlobalStatus();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />Avisos do Sistema
          </h1>
          <p className="text-sm text-muted-foreground">O CyberShield detectou situações que merecem sua atenção</p>
        </div>
        {pendingInsights.length > 0 && (
          <Button onClick={() => acknowledgeAllMutation.mutate(pendingInsights.map(i => i.id))} disabled={acknowledgeAllMutation.isPending} size="sm">
            <CheckCircle className="h-4 w-4 mr-2" />Entendi Todos ({pendingInsights.length})
          </Button>
        )}
      </div>

      {/* Global Status */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={cn("border-2",
          globalStatus.variant === 'success' && "bg-green-500/5 border-green-500/30",
          globalStatus.variant === 'warning' && "bg-amber-500/5 border-amber-500/30",
          globalStatus.variant === 'danger' && "bg-red-500/5 border-red-500/30"
        )}>
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className={cn("p-4 rounded-full",
                globalStatus.variant === 'success' && "bg-green-500/10",
                globalStatus.variant === 'warning' && "bg-amber-500/10",
                globalStatus.variant === 'danger' && "bg-red-500/10"
              )}>
                <Shield className={cn("h-10 w-10",
                  globalStatus.variant === 'success' && "text-green-500",
                  globalStatus.variant === 'warning' && "text-amber-500",
                  globalStatus.variant === 'danger' && "text-red-500"
                )} />
              </div>
              <div className="flex-1">
                <h2 className={cn("text-xl font-bold",
                  globalStatus.variant === 'success' && "text-green-600 dark:text-green-400",
                  globalStatus.variant === 'warning' && "text-amber-600 dark:text-amber-400",
                  globalStatus.variant === 'danger' && "text-red-600 dark:text-red-400"
                )}>
                  {globalStatus.emoji} {globalStatus.title}
                </h2>
                <p className="text-muted-foreground mt-1">{globalStatus.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-l-4 border-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.critical}</div>
              <p className="text-xs text-muted-foreground">{stats.critical > 0 ? 'Precisam de ação imediata' : '✓ Nenhum urgente'}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-l-4 border-yellow-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Atenção</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.warning}</div>
              <p className="text-xs text-muted-foreground">{stats.warning > 0 ? 'Vale a pena verificar' : '✓ Sem pendências'}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-l-4 border-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolvidos</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.acknowledged}</div>
              <p className="text-xs text-muted-foreground">De {stats.total} no total</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1"><InsightsTrendChart /></div>
        <FeedbackStatsCard />
        <AIApprovalMetrics />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />Aguardando ({pendingInsights.length})
          </TabsTrigger>
          <TabsTrigger value="acknowledged" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />Resolvidos ({acknowledgedInsights.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingInsights.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Tudo certo por aqui!</AlertTitle>
              <AlertDescription>O sistema está monitorando seus computadores continuamente. Novos avisos aparecerão aqui automaticamente quando algo precisar da sua atenção.</AlertDescription>
            </Alert>
          ) : (
            pendingInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                onDismiss={(ins) => { setSelectedInsightForDismiss(ins); setDismissDialogOpen(true); }}
                onExecuteSolution={(params) => executeSolutionMutation.mutate(params)}
                isAcknowledging={acknowledgeMutation.isPending}
                isExecuting={executeSolutionMutation.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="acknowledged" className="space-y-4">
          {acknowledgedInsights.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Nenhum insight reconhecido ainda</AlertTitle>
              <AlertDescription>Insights reconhecidos aparecerao aqui para referencia historica.</AlertDescription>
            </Alert>
          ) : (
            acknowledgedInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} variant="acknowledged"
                onAcknowledge={() => {}} onDismiss={() => {}} onExecuteSolution={() => {}}
                isAcknowledging={false} isExecuting={false} />
            ))
          )}
        </TabsContent>
      </Tabs>

      {selectedInsightForDismiss && (
        <DismissInsightDialog
          open={dismissDialogOpen}
          onOpenChange={setDismissDialogOpen}
          insightId={selectedInsightForDismiss.id}
          insightTitle={selectedInsightForDismiss.title}
        />
      )}
    </div>
  );
}
