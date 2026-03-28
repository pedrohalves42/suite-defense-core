import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useOnboarding } from '@/hooks/useOnboarding';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { 
  Bell, 
  Monitor, 
  Shield, 
  Check,
  ArrowRight,
  ArrowLeft,
  X,
  PartyPopper,
  Loader2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  checkFn: () => Promise<boolean>;
  actionText: string;
  actionLink: string;
  skipText?: string;
}

export function FirstTimeSetupWizard() {
  const { showOnboarding, completeOnboarding, dismissFor7Days } = useOnboarding();
  // V-314: include loading to prevent race conditions during tenant sync
  const { activeTenant, loading } = useActiveTenant();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<string, boolean>>({});
  const [isCheckingSteps, setIsCheckingSteps] = useState(true);

  const tenantId = activeTenant?.id;

  const steps: Step[] = [
    {
      id: 'notifications',
      title: 'Configurar Notificações',
      description: 'Receba alertas importantes por email, WhatsApp ou Telegram quando algo precisar da sua atenção.',
      icon: <Bell className="h-8 w-8" />,
      checkFn: async () => {
        if (!tenantId) return false;
        const { count } = await supabase
          .from('notification_channels')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true);
        return (count || 0) > 0;
      },
      actionText: 'Configurar Notificações',
      actionLink: '/admin/notification-channels',
      skipText: 'Configurar depois'
    },
    {
      id: 'first_agent',
      title: 'Instalar Primeiro Agente',
      description: 'Instale o agente em pelo menos um computador para começar a monitorar e proteger seu ambiente.',
      icon: <Monitor className="h-8 w-8" />,
      checkFn: async () => {
        if (!tenantId) return false;
        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        const { data } = await supabase.rpc('get_agents_list', {
          p_tenant_id: tenantId,
          p_include_archived: false,
        });
        return ((data as unknown[]) || []).length > 0;
      },
      actionText: 'Instalar Agente',
      actionLink: '/installer',
      skipText: 'Pular'
    },
    {
      id: 'verify_status',
      title: 'Verificar Status',
      description: 'Confira se o agente está funcionando corretamente e coletando dados do seu ambiente.',
      icon: <Shield className="h-8 w-8 text-cta-positive" />,
      checkFn: async () => {
        if (!tenantId) return false;
        // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
        const { data } = await supabase.rpc('get_agents_list', {
          p_tenant_id: tenantId,
          p_include_archived: false,
        });
        const agents = (data as unknown as Array<{ last_heartbeat: string | null }>) || [];
        return agents.some(a => a.last_heartbeat !== null);
      },
      actionText: 'Ver Dashboard',
      actionLink: '/admin/executive',
      skipText: 'Finalizar'
    }
  ];

  // ADR-VELLUM V-102: Guard - only check steps when tenant is ready
  useEffect(() => {
    const checkSteps = async () => {
      if (!tenantId) return;
      
      setIsCheckingSteps(true);
      const statuses: Record<string, boolean> = {};
      
      for (const step of steps) {
        try {
          statuses[step.id] = await step.checkFn();
        } catch (e) {
          statuses[step.id] = false;
        }
      }
      
      setStepStatuses(statuses);
      setIsCheckingSteps(false);
      
      // Avançar para primeiro step incompleto
      const firstIncomplete = steps.findIndex(s => !statuses[s.id]);
      if (firstIncomplete >= 0) {
        setCurrentStep(firstIncomplete);
      }
    };
    
    // V-314: Guard - ensure tenant is fully synchronized before checking steps
    if (showOnboarding && !loading && tenantId && activeTenant?.id) {
      checkSteps();
    }
  }, [tenantId, showOnboarding, activeTenant?.id, loading]);

  const completedSteps = Object.values(stepStatuses).filter(Boolean).length;
  const progress = (completedSteps / steps.length) * 100;
  const allCompleted = completedSteps === steps.length;

  const currentStepData = steps[currentStep];
  const isCurrentStepComplete = stepStatuses[currentStepData?.id];

  const handleAction = () => {
    navigate(currentStepData.actionLink);
    // Não fecha o dialog - usuário pode voltar
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else if (allCompleted) {
      completeOnboarding();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      dismissFor7Days();
    }
  };

  const handleComplete = () => {
    completeOnboarding();
  };

  if (!showOnboarding) return null;

  return (
    <Dialog open={showOnboarding} onOpenChange={(open) => !open && dismissFor7Days()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">
              {allCompleted ? 'Configuração Completa!' : 'Bem-vindo ao CyberShield'}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={dismissFor7Days}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription>
            {allCompleted 
              ? 'Seu ambiente está pronto para ser monitorado.'
              : 'Vamos configurar o básico para proteger seu ambiente.'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progresso</span>
            <span className="font-medium">{completedSteps} de {steps.length}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps Indicator */}
        <div className="flex justify-center gap-2">
          {steps.map((step, index) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(index)}
              className={cn(
                "w-3 h-3 rounded-full transition-all",
                index === currentStep && "ring-2 ring-offset-2 ring-primary",
                stepStatuses[step.id] 
                  ? "bg-green-500" 
                  : index === currentStep 
                    ? "bg-primary" 
                    : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Current Step Content */}
        {isCheckingSteps ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : allCompleted ? (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6 text-center">
              <PartyPopper className="h-16 w-16 mx-auto text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
                Tudo Configurado!
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Seu ambiente está pronto. Você pode acompanhar tudo pelo Dashboard Executivo.
              </p>
              <Button onClick={handleComplete} className="w-full">
                Ir para o Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className={cn(
            "transition-all",
            isCurrentStepComplete && "border-green-200 bg-green-50/50 dark:bg-green-950/20"
          )}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className={cn(
                  "p-3 rounded-lg",
                  isCurrentStepComplete 
                    ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400" 
                    : "bg-primary/10 text-primary"
                )}>
                  {isCurrentStepComplete ? (
                    <Check className="h-8 w-8" />
                  ) : (
                    currentStepData.icon
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{currentStepData.title}</h3>
                    {isCurrentStepComplete && (
                      <Badge variant="outline" className="bg-green-100 text-green-700">
                        Concluído
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentStepData.description}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                {!isCurrentStepComplete ? (
                  <>
                    <Button onClick={handleAction} className="flex-1">
                      {currentStepData.actionText}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    {currentStepData.skipText && (
                      <Button variant="ghost" onClick={handleSkip}>
                        {currentStepData.skipText}
                      </Button>
                    )}
                  </>
                ) : (
                  <Button onClick={handleNext} className="w-full">
                    {currentStep < steps.length - 1 ? 'Próximo' : 'Concluir'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        {!allCompleted && (
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Anterior
            </Button>
            <Button
              variant="ghost"
              onClick={dismissFor7Days}
            >
              Lembrar em 7 dias
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
