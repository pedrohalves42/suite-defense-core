import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CheckCircle2, Bell, BellOff, Coffee } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOfflineAgentAlerts } from './useOfflineAgentAlerts';
import { AgentAlertRow } from './AgentAlertRow';

export function OfflineAgentAlerts() {
  const {
    offlineAgents,
    displayedAgents,
    isLoading,
    isBusinessHoursActive,
    businessHours,
    acknowledgedAgents,
    unacknowledgedCount,
    showAcknowledged,
    setShowAcknowledged,
    handleAcknowledge,
    handleAcknowledgeAll,
  } = useOfflineAgentAlerts();

  if (!isLoading && offlineAgents.length === 0) return null;

  // Off-hours simplified view
  if (!isBusinessHoursActive && offlineAgents.length > 0) {
    return (
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-l-4 border-l-slate-400 bg-gradient-to-br from-slate-50/50 to-slate-100/30 dark:from-slate-950/20 dark:to-slate-900/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Coffee className="h-5 w-5 text-slate-500" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  Fora do Horário de Expediente
                  <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700">
                    {offlineAgents.length} offline
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  {offlineAgents.length} agente(s) offline — comportamento esperado fora do expediente
                  ({businessHours.start} - {businessHours.end})
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-red-50/50 to-orange-50/30 dark:from-red-950/20 dark:to-orange-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/50 animate-pulse">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Alertas de Agentes Offline
                  {unacknowledgedCount > 0 && (
                    <Badge variant="destructive" className="animate-pulse">{unacknowledgedCount}</Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  Agentes sem comunicação há mais de 1 hora (horário de expediente)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAcknowledged(!showAcknowledged)} className="text-xs">
                {showAcknowledged ? (
                  <><BellOff className="h-4 w-4 mr-1" />Ocultar Reconhecidos</>
                ) : (
                  <><Bell className="h-4 w-4 mr-1" />Mostrar Todos ({offlineAgents.length})</>
                )}
              </Button>
              {unacknowledgedCount > 1 && (
                <Button variant="outline" size="sm" onClick={handleAcknowledgeAll} className="text-xs">
                  <CheckCircle2 className="h-4 w-4 mr-1" />Reconhecer Todos
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Clock className="h-4 w-4 animate-spin mr-2" />Verificando agentes...
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {displayedAgents.map((agent) => (
                  <AgentAlertRow
                    key={agent.agent_id}
                    agent={agent}
                    isBusinessHoursActive={isBusinessHoursActive}
                    isAcknowledged={acknowledgedAgents.has(agent.agent_id)}
                    onAcknowledge={handleAcknowledge}
                  />
                ))}
              </AnimatePresence>
              {displayedAgents.length === 0 && offlineAgents.length > 0 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  Todos os alertas foram reconhecidos ✓
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
