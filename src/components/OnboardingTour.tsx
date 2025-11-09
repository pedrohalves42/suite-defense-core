import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, ArrowRight, ArrowLeft, X, Shield, Users, Activity, FileCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface TourStep {
  title: string;
  description: string;
  icon: any;
  action?: string;
  image?: string;
}

const tourSteps: TourStep[] = [
  {
    title: 'Bem-vindo ao CyberShield! 🎉',
    description: 'Vamos fazer um tour rápido pela plataforma para você começar a proteger seus endpoints imediatamente.',
    icon: Shield,
  },
  {
    title: 'Instale Agentes',
    description: 'O primeiro passo é instalar agentes nos seus servidores Windows ou Linux. Vá em "Instalador de Agentes" no menu lateral e siga as instruções.',
    icon: Activity,
    action: 'Ir para Instalador',
  },
  {
    title: 'Execute Scans de Segurança',
    description: 'Com os agentes instalados, você pode executar scans de vírus, verificações de segurança e análises de rede remotamente.',
    icon: FileCheck,
    action: 'Ver Jobs',
  },
  {
    title: 'Gerencie Usuários',
    description: 'Convide membros da sua equipe com diferentes níveis de acesso: Admin (controle total), Operador (criar jobs) ou Visualizador (somente leitura).',
    icon: Users,
    action: 'Gerenciar Usuários',
  },
  {
    title: 'Pronto para começar! ✅',
    description: 'Você está pronto! Explore o dashboard, instale seus primeiros agentes e comece a monitorar a segurança dos seus endpoints.',
    icon: CheckCircle2,
  },
];

export const OnboardingTour = ({ open, onClose, onComplete }: OnboardingTourProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  const handleSkip = () => {
    onComplete();
    onClose();
  };

  const currentTourStep = tourSteps[currentStep];
  const Icon = currentTourStep.icon;
  const isLastStep = currentStep === tourSteps.length - 1;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden">
        {/* Header with close button */}
        <div className="absolute right-4 top-4 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkip}
            className="rounded-full h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-muted-foreground">
              Passo {currentStep + 1} de {tourSteps.length}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <DialogHeader className="px-6 pt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <DialogTitle className="text-2xl">{currentTourStep.title}</DialogTitle>
              </div>
              <DialogDescription className="text-base leading-relaxed">
                {currentTourStep.description}
              </DialogDescription>
            </DialogHeader>

            {/* Visual content area */}
            <div className="px-6 py-8">
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl p-8 border border-primary/20 flex items-center justify-center min-h-[200px]">
                <Icon className="h-24 w-24 text-primary/40" />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <DialogFooter className="px-6 pb-6 flex-row gap-2 sm:gap-2">
          <div className="flex w-full gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Anterior
              </Button>
            )}
            
            {currentStep === 0 && (
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="flex-1"
              >
                Pular Tour
              </Button>
            )}

            <Button
              onClick={handleNext}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Começar
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
