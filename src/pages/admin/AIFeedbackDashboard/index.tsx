import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Brain, ThumbsUp, ThumbsDown, Flag, TrendingUp,
  BarChart3, MessageSquare, Lightbulb, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, ptBR } from '@/lib/date-utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { useAIFeedbackDashboard } from './useAIFeedbackDashboard';

const getSeverityBadge = (severity: string) => {
  const variants: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-600 border-red-200',
    high: 'bg-orange-500/10 text-orange-600 border-orange-200',
    medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
    low: 'bg-blue-500/10 text-blue-600 border-blue-200',
    info: 'bg-muted text-muted-foreground',
  };
  return variants[severity] || variants.info;
};

export default function AIFeedbackDashboard() {
  const {
    insights, insightsLoading, stats, usefulRate,
    pieData, barData, submitFeedback, handleFeedback, refreshAll,
  } = useAIFeedbackDashboard();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Qualidade dos Insights de IA
          </h1>
          <p className="text-muted-foreground text-xs">
            Avalie os insights para melhorar continuamente a precisão da análise
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-600">{usefulRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Utilidade</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ThumbsUp className="h-6 w-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.useful || 0}</p>
            <p className="text-xs text-muted-foreground">Úteis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <ThumbsDown className="h-6 w-6 text-orange-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.noise || 0}</p>
            <p className="text-xs text-muted-foreground">Ruído</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flag className="h-6 w-6 text-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.falsePositive || 0}</p>
            <p className="text-xs text-muted-foreground">Falsos Positivos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Sem Avaliação</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição de Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhum feedback registrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualidade por Tipo de Insight</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Útil" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Ruído" stackId="a" fill="#f97316" />
                  <Bar dataKey="Falso+" stackId="a" fill="#ef4444" />
                  <Bar dataKey="Sem avaliação" stackId="a" fill="#94a3b8" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <BarChart3 className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Dados insuficientes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Insights Recentes — Avalie para Melhorar a IA
          </CardTitle>
          <CardDescription className="text-xs">
            Cada avaliação ajuda a calibrar a precisão dos insights futuros
          </CardDescription>
        </CardHeader>
        <CardContent>
          {insightsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !insights?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhum insight gerado ainda</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <AnimatePresence>
                <div className="space-y-2">
                  {insights.map((insight, idx) => (
                    <motion.div
                      key={insight.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={cn(
                        "p-3 rounded-lg border transition-colors",
                        insight.feedback_type === 'useful' && "border-green-200 bg-green-500/5",
                        insight.feedback_type === 'noise' && "border-orange-200 bg-orange-500/5",
                        insight.feedback_type === 'false_positive' && "border-red-200 bg-red-500/5",
                        !insight.feedback_type && "border-border"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={cn("text-[10px]", getSeverityBadge(insight.severity))}>
                              {insight.severity}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {insight.insight_type?.replace(/_/g, ' ')}
                            </Badge>
                            {insight.auto_executed && (
                              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600">
                                Auto-executado
                              </Badge>
                            )}
                            {insight.feedback_type && (
                              <Badge variant="outline" className={cn("text-[10px]",
                                insight.feedback_type === 'useful' && "bg-green-500/10 text-green-600",
                                insight.feedback_type === 'noise' && "bg-orange-500/10 text-orange-600",
                                insight.feedback_type === 'false_positive' && "bg-red-500/10 text-red-600",
                              )}>
                                {insight.feedback_type === 'useful' ? '✓ Útil' :
                                 insight.feedback_type === 'noise' ? '⚡ Ruído' : '🚩 Falso+'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate">{insight.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(insight.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant={insight.feedback_type === 'useful' ? 'default' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleFeedback(insight.id, 'useful')}
                            disabled={submitFeedback.isPending}
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={insight.feedback_type === 'noise' ? 'default' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleFeedback(insight.id, 'noise')}
                            disabled={submitFeedback.isPending}
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={insight.feedback_type === 'false_positive' ? 'destructive' : 'ghost'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleFeedback(insight.id, 'false_positive')}
                            disabled={submitFeedback.isPending}
                          >
                            <Flag className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </AnimatePresence>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
