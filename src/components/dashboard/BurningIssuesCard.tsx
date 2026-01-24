import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Flame, CheckCircle, AlertTriangle, WifiOff, 
  Bug, Brain, ChevronRight 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface BurningIssue {
  id: string;
  title: string;
  impact: string;
  priority: 'critical' | 'high' | 'medium';
  actionUrl: string;
  icon: LucideIcon;
  count?: number;
}

interface Props {
  criticalAlerts?: number;
  offlineAgents?: number;
  criticalVulns?: number;
  pendingInsights?: number;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2 };
const PRIORITY_COLORS = {
  critical: 'text-red-600 bg-red-500/10 border-red-500/20',
  high: 'text-orange-600 bg-orange-500/10 border-orange-500/20',
  medium: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
};

export function BurningIssuesCard({ 
  criticalAlerts = 0, 
  offlineAgents = 0, 
  criticalVulns = 0,
  pendingInsights = 0 
}: Props) {
  const navigate = useNavigate();

  const issues = useMemo<BurningIssue[]>(() => {
    const list: BurningIssue[] = [];
    
    if (criticalAlerts > 0) {
      list.push({
        id: 'alerts',
        title: `${criticalAlerts} alerta${criticalAlerts > 1 ? 's' : ''} crítico${criticalAlerts > 1 ? 's' : ''}`,
        impact: 'Podem indicar ameaças ativas',
        priority: 'critical',
        actionUrl: '/admin/security-monitoring',
        icon: AlertTriangle,
        count: criticalAlerts,
      });
    }
    
    if (criticalVulns > 0) {
      list.push({
        id: 'vulns',
        title: `${criticalVulns} vulnerabilidade${criticalVulns > 1 ? 's' : ''} crítica${criticalVulns > 1 ? 's' : ''}`,
        impact: 'Podem ser exploradas por atacantes',
        priority: 'high',
        actionUrl: '/admin/vulnerabilities',
        icon: Bug,
        count: criticalVulns,
      });
    }
    
    if (offlineAgents > 0) {
      list.push({
        id: 'offline',
        title: `${offlineAgents} computador${offlineAgents > 1 ? 'es' : ''} offline`,
        impact: 'Não recebem atualizações de segurança',
        priority: 'medium',
        actionUrl: '/admin/agent-health',
        icon: WifiOff,
        count: offlineAgents,
      });
    }
    
    if (pendingInsights > 0) {
      list.push({
        id: 'insights',
        title: `${pendingInsights} insight${pendingInsights > 1 ? 's' : ''} da IA`,
        impact: 'Recomendações para melhorar proteção',
        priority: 'medium',
        actionUrl: '/admin/ai-insights',
        icon: Brain,
        count: pendingInsights,
      });
    }
    
    return list
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      .slice(0, 3);
  }, [criticalAlerts, offlineAgents, criticalVulns, pendingInsights]);

  // Tudo ok
  if (issues.length === 0) {
    return (
      <Card className="border-2 border-green-500/30 bg-green-500/5">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="p-3 rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-green-600">
              Nada urgente agora
            </h3>
            <p className="text-sm text-muted-foreground">
              Todos os sistemas operando normalmente
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Flame className="h-5 w-5" />
          O que precisa de atenção agora
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {issues.map(issue => {
          const Icon = issue.icon;
          return (
            <div 
              key={issue.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                PRIORITY_COLORS[issue.priority]
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">{issue.title}</p>
                  <p className="text-sm opacity-80">{issue.impact}</p>
                </div>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                className="gap-1"
                onClick={() => navigate(issue.actionUrl)}
              >
                Resolver
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
