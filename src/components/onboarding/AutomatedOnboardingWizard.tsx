import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { 
  PartyPopper, 
  Key, 
  Download, 
  Wifi, 
  PlayCircle, 
  FileText,
  CheckCircle2,
  ArrowRight,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AutomatedOnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  onDismiss?: () => void;
}

export const AutomatedOnboardingWizard = ({ 
  open, 
  onComplete, 
  onDismiss 
}: AutomatedOnboardingWizardProps) => {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const { 
    currentStep, 
    completeStep, 
    isStepCompleted, 
    skipOnboarding,
    initializeOnboarding,
    progress
  } = useOnboardingProgress();
  
  const [localStep, setLocalStep] = useState(0);
  const [hasEnrollmentKey, setHasEnrollmentKey] = useState(false);
  const [hasAgent, setHasAgent] = useState(false);
  const [hasReport, setHasReport] = useState(false);

  // Initialize onboarding on mount
  useEffect(() => {
    if (open && !progress) {
      initializeOnboarding();
    }
  }, [open, progress, initializeOnboarding]);

  // Check tenant status for auto-completion
  useEffect(() => {
    const checkStatus = async () => {
      if (!tenant?.id) return;

      // Check for enrollment keys
      const { count: keyCount } = await supabase
        .from('enrollment_keys')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      
      if ((keyCount || 0) > 0) {
        setHasEnrollmentKey(true);
        if (!isStepCompleted('generate_key')) {
          completeStep('generate_key');
        }
      }

      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      const agents = (agentsRaw as unknown as Array<{ id: string; last_heartbeat: string | null }>) || [];
      
      if (agents && agents.length > 0) {
        setHasAgent(true);
        if (!isStepCompleted('install_agent')) {
          completeStep('install_agent');
        }
        if (agents[0].last_heartbeat && !isStepCompleted('first_heartbeat')) {
          completeStep('first_heartbeat');
        }
      }

      // Check for reports
      const { count: reportCount } = await supabase
        .from('generated_reports')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      
      if ((reportCount || 0) > 0) {
        setHasReport(true);
        if (!isStepCompleted('view_report')) {
          completeStep('view_report');
        }
      }
    };

    if (open) {
      checkStatus();
      const interval = setInterval(checkStatus, 10000); // Check every 10s
      return () => clearInterval(interval);
    }
  }, [tenant?.id, open, isStepCompleted, completeStep]);

  const steps = [
    {
      id: 'welcome',
      title: 'Bem-vindo ao CyberShield!',
      description: 'Vamos configurar a proteção dos seus computadores em poucos passos.',
      icon: PartyPopper,
      action: () => {
        completeStep('welcome');
        setLocalStep(1);
      },
      actionLabel: 'Começar',
      completed: isStepCompleted('welcome')
    },
    {
      id: 'generate_key',
      title: 'Gerar Chave de Instalação',
      description: 'Crie uma chave para instalar o agente nos seus computadores.',
      icon: Key,
      action: () => {
        completeStep('generate_key');
        navigate('/admin/enrollment-keys');
        onComplete();
      },
      actionLabel: hasEnrollmentKey ? 'Já tenho chave ✓' : 'Ir para Chaves',
      completed: isStepCompleted('generate_key') || hasEnrollmentKey
    },
    {
      id: 'install_agent',
      title: 'Instalar o Agente',
      description: 'Execute o comando de instalação no computador que deseja proteger.',
      icon: Download,
      action: () => {
        completeStep('install_agent');
        navigate('/admin/enrollment-keys');
        onComplete();
      },
      actionLabel: hasAgent ? 'Agente instalado ✓' : 'Ver instruções',
      completed: isStepCompleted('install_agent') || hasAgent
    },
    {
      id: 'first_heartbeat',
      title: 'Aguardar Conexão',
      description: 'O agente enviará um sinal quando estiver conectado.',
      icon: Wifi,
      action: () => {
        completeStep('first_heartbeat');
        setLocalStep(4);
      },
      actionLabel: hasAgent ? 'Conectado ✓' : 'Aguardando...',
      completed: isStepCompleted('first_heartbeat') || hasAgent,
      autoComplete: true
    },
    {
      id: 'create_job',
      title: 'Primeira Análise',
      description: 'Execute uma análise de segurança no computador.',
      icon: PlayCircle,
      action: () => {
        completeStep('create_job');
        navigate('/admin/agent-monitoring');
        onComplete();
      },
      actionLabel: 'Ir para Monitoramento',
      completed: isStepCompleted('create_job')
    },
    {
      id: 'view_report',
      title: 'Ver Relatório',
      description: 'Confira o resultado da análise de segurança.',
      icon: FileText,
      action: () => {
        completeStep('view_report');
        navigate('/admin/reports');
        onComplete();
      },
      actionLabel: hasReport ? 'Relatório pronto ✓' : 'Ver Relatórios',
      completed: isStepCompleted('view_report') || hasReport
    }
  ];

  const activeStep = steps[localStep];
  const progressPercent = ((localStep + 1) / steps.length) * 100;

  const handleSkip = () => {
    skipOnboarding();
    onDismiss?.();
  };

  const handleNext = () => {
    if (localStep < steps.length - 1) {
      setLocalStep(localStep + 1);
    } else {
      onComplete();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss?.()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Configuração Inicial</DialogTitle>
            <Button variant="ghost" size="icon" onClick={handleSkip}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Passo {localStep + 1} de {steps.length}</span>
              <span className="font-medium">{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-2">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === localStep 
                    ? 'bg-primary' 
                    : step.completed 
                      ? 'bg-green-500' 
                      : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={localStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className={`p-4 rounded-full ${activeStep?.completed ? 'bg-green-500/10' : 'bg-primary/10'}`}>
                      {activeStep?.completed ? (
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                      ) : (
                        activeStep && <activeStep.icon className="h-8 w-8 text-primary" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{activeStep?.title}</h3>
                      <p className="text-muted-foreground mt-1">{activeStep?.description}</p>
                    </div>
                    {activeStep?.completed && (
                      <Badge variant="default" className="bg-green-500/10 text-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Concluído
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* Actions */}
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={handleSkip}
            >
              Pular tutorial
            </Button>
            <div className="flex gap-2">
              {localStep > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setLocalStep(localStep - 1)}
                >
                  Voltar
                </Button>
              )}
              {activeStep?.completed || activeStep?.autoComplete ? (
                <Button onClick={handleNext}>
                  {localStep === steps.length - 1 ? 'Concluir' : 'Próximo'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={activeStep?.action}>
                  {activeStep?.actionLabel}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
