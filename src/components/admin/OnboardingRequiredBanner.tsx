import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  Key, 
  Download, 
  Wifi, 
  Bell,
  Shield,
  Gift
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutomatedOnboardingWizard } from '@/components/onboarding/AutomatedOnboardingWizard';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  completed: boolean;
  link?: string;
}

export function OnboardingRequiredBanner() {
  const adaptiveInterval = useAdaptivePolling(300000);
  const { tenant } = useTenant();
  const [showWizard, setShowWizard] = useState(false);

  // Fetch onboarding progress
  const { data: progress, refetch } = useQuery({
    queryKey: ['onboarding-progress', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      
      // Check each step
      const [keyResult, agentResult, channelResult] = await Promise.all([
        supabase
          .from('enrollment_keys')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id),
        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        supabase.rpc('get_agents_list', {
          p_tenant_id: tenant.id,
          p_include_archived: false,
        }),
        supabase
          .from('notification_channels')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
      ]);

      const hasKey = (keyResult.count || 0) > 0;
      const agents = ((agentResult.data as any as Array<{ id: string; last_heartbeat: string | null }>) || []);
      const hasAgent = agents.length > 0;
      const hasOnlineAgent = agents.some(a => a.last_heartbeat && 
        new Date(a.last_heartbeat) > new Date(Date.now() - 30 * 60 * 1000)); // 30min threshold
      const hasNotifications = (channelResult.count || 0) > 0;

      return {
        hasKey,
        hasAgent,
        hasOnlineAgent,
        hasNotifications,
        completedSteps: [hasKey, hasAgent, hasOnlineAgent, hasNotifications].filter(Boolean).length,
        totalSteps: 4,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });

  // Auto-refresh when focus returns
  useEffect(() => {
    const handleFocus = () => refetch();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  // Don't show if fully completed
  if (!progress || progress.completedSteps === progress.totalSteps) {
    return null;
  }

  const steps: OnboardingStep[] = [
    {
      id: 'key',
      label: 'Criar chave de registro',
      description: 'Gere uma chave para instalar agentes',
      icon: Key,
      completed: progress.hasKey,
      link: '/super-admin/enrollment-keys',
    },
    {
      id: 'install',
      label: 'Instalar primeiro agente',
      description: 'Execute o comando no computador',
      icon: Download,
      completed: progress.hasAgent,
      link: '/super-admin/enrollment-keys',
    },
    {
      id: 'online',
      label: 'Agente conectado',
      description: 'Aguardando conexão do agente',
      icon: Wifi,
      completed: progress.hasOnlineAgent,
      link: '/admin/agent-monitoring',
    },
    {
      id: 'notifications',
      label: 'Configurar alertas',
      description: 'Receba notificações de segurança',
      icon: Bell,
      completed: progress.hasNotifications,
      link: '/admin/notification-channels',
    },
  ];

  const progressPercent = (progress.completedSteps / progress.totalSteps) * 100;
  const nextStep = steps.find(s => !s.completed);

  return (
    <>
      <Card className="border-2 border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Complete a configuração inicial
            </CardTitle>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
              <Gift className="h-3 w-3 mr-1" />
              +7 dias de trial
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {progress.completedSteps} de {progress.totalSteps} passos completos
              </span>
              <span className="font-medium text-primary">{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Steps */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    step.completed
                      ? "bg-green-500/10 border-green-500/30"
                      : step === nextStep
                      ? "bg-primary/10 border-primary/30"
                      : "bg-muted/30 border-border/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {step.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle className={cn(
                        "h-4 w-4",
                        step === nextStep ? "text-primary" : "text-muted-foreground"
                      )} />
                    )}
                    <Icon className={cn(
                      "h-4 w-4",
                      step.completed ? "text-green-500" : 
                      step === nextStep ? "text-primary" : 
                      "text-muted-foreground"
                    )} />
                  </div>
                  <p className={cn(
                    "text-xs font-medium",
                    step.completed ? "text-green-600" : 
                    step === nextStep ? "text-primary" : 
                    "text-muted-foreground"
                  )}>
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          {nextStep && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Próximo: <span className="font-medium">{nextStep.description}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
                  Ver tutorial
                </Button>
                <Button asChild size="sm">
                  <Link to={nextStep.link || '#'}>
                    {nextStep.label}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AutomatedOnboardingWizard
        open={showWizard}
        onComplete={() => {
          setShowWizard(false);
          refetch();
        }}
        onDismiss={() => setShowWizard(false)}
      />
    </>
  );
}
