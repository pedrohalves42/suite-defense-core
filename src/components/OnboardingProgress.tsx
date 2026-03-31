import { useState, useEffect } from 'react';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  Rocket,
  BookOpen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  link?: string;
}

export const OnboardingProgress = () => {
  const { user } = useAuth();
  const [agentCount, setAgentCount] = useState(0);
  const [hasOnlineAgent, setHasOnlineAgent] = useState(false);
  const [hasSecurityData, setHasSecurityData] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProgress();
    }
  }, [user]);

  const fetchProgress = async () => {
    try {
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: user?.id ?? '',
        p_include_archived: false,
      });
      const agents = (agentsRaw as unknown as Array<{ id: string; status: string; last_heartbeat: string | null }>) || [];
      
      if (agents) {
        setAgentCount(agents.length);
        const onlineThresholdMs = AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000;
        setHasOnlineAgent(agents.some(a => a.last_heartbeat && (Date.now() - new Date(a.last_heartbeat).getTime()) < onlineThresholdMs));
      }

      // Check security data (simplified check)
      const { count } = await supabase
        .from('software_inventory')
        .select('id', { count: 'exact', head: true });
      
      setHasSecurityData((count || 0) > 0);
    } catch (error) {
      logger.error('Error fetching progress:', error);
    }
  };

  const steps: OnboardingStep[] = [
    {
      id: 'account',
      label: 'Conta Criada',
      description: 'Login realizado com sucesso',
      completed: !!user,
    },
    {
      id: 'first-agent',
      label: 'Primeiro Agente Instalado',
      description: 'Agente monitorando um computador',
      completed: agentCount > 0,
      link: '/installer',
    },
    {
      id: 'agent-online',
      label: 'Agente Conectado',
      description: 'Comunicação estabelecida',
      completed: hasOnlineAgent,
      link: '/dashboard',
    },
    {
      id: 'security-data',
      label: 'Dados Coletados',
      description: 'Métricas de segurança recebidas',
      completed: hasSecurityData,
      link: '/admin/software-inventory',
    },
  ];

  const completedSteps = steps.filter(s => s.completed).length;
  const progress = (completedSteps / steps.length) * 100;

  // Don't show if all completed
  if (progress === 100) {
    return null;
  }

  const nextStep = steps.find(s => !s.completed);

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Configure sua Conta</CardTitle>
          </div>
          <Badge variant="secondary">{completedSteps}/{steps.length}</Badge>
        </div>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {steps.map((step) => (
          <div 
            key={step.id}
            className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
              step.completed ? 'opacity-60' : 'bg-background/50'
            }`}
          >
            {step.completed ? (
              <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.completed ? 'line-through' : ''}`}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">{step.description}</p>
            </div>
            {!step.completed && step.link && (
              <Button asChild size="sm" variant="ghost" className="flex-shrink-0">
                <Link to={step.link}>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-2 border-t">
          <Button asChild size="sm" variant="link" className="p-0 h-auto text-xs">
            <Link to="/docs/onboarding" className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              Ver guia completo
            </Link>
          </Button>
          {nextStep?.link && (
            <Button asChild size="sm">
              <Link to={nextStep.link}>
                {nextStep.label}
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
