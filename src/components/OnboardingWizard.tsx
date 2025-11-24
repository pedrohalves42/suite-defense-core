import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Rocket, Scan, BarChart, ArrowRight, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
}

const ONBOARDING_STORAGE_KEY = 'cybershield_onboarding_wizard_completed';

export const OnboardingWizard = ({ open, onComplete }: OnboardingWizardProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const steps = [
    {
      title: 'Bem-vindo ao CyberShield!',
      description: 'Vamos configurar sua conta em 3 passos simples',
      icon: Rocket,
      content: (
        <div className="space-y-4 text-center py-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Rocket className="w-10 h-10 text-primary animate-bounce" />
          </div>
          <h3 className="text-2xl font-bold">Pronto para começar?</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Em menos de 5 minutos você terá:
          </p>
          <div className="grid gap-3 max-w-md mx-auto text-left">
            <div className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-sm">Agente instalado e monitorando</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-sm">Primeiro scan de segurança executado</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border">
              <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-sm">Dashboard com métricas em tempo real</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Passo 1: Instalar Agente',
      description: 'Instale o agente CyberShield no seu computador',
      icon: Rocket,
      content: (
        <div className="space-y-4 py-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Rocket className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-center">Instale o Agente</h3>
          <p className="text-muted-foreground text-center max-w-md mx-auto">
            O agente monitora seu dispositivo e envia métricas de segurança em tempo real.
          </p>
          
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Windows PowerShell</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText('irm https://cybershield.app/install | iex');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    toast({
                      title: 'Comando copiado!',
                      description: 'Cole no PowerShell como Administrador',
                    });
                  }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <code className="block p-3 bg-background rounded text-xs font-mono break-all">
                irm https://cybershield.app/install | iex
              </code>
            </CardContent>
          </Card>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-sm text-blue-400">
              💡 <strong>Dica:</strong> Execute o PowerShell como Administrador (clique com botão direito → "Executar como administrador")
            </p>
          </div>

          <Button 
            className="w-full"
            onClick={() => navigate('/installer')}
          >
            Ir para Instalação Completa
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      ),
    },
    {
      title: 'Passo 2: Primeiro Scan',
      description: 'Execute seu primeiro scan de segurança',
      icon: Scan,
      content: (
        <div className="space-y-4 py-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Scan className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-center">Execute um Scan</h3>
          <p className="text-muted-foreground text-center max-w-md mx-auto">
            Após instalar o agente, crie e execute seu primeiro job de scan para verificar a segurança do dispositivo.
          </p>
          
          <div className="grid gap-3">
            <Card className="bg-card/50 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Acesse a página de Jobs</p>
                    <p className="text-sm text-muted-foreground">Crie um novo job de scan</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Selecione o arquivo</p>
                    <p className="text-sm text-muted-foreground">Escolha um arquivo para análise</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">3</span>
                  </div>
                  <div>
                    <p className="font-medium">Aguarde o resultado</p>
                    <p className="text-sm text-muted-foreground">O scan será executado automaticamente</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button 
            className="w-full"
            onClick={() => navigate('/jobs')}
          >
            Criar Primeiro Job
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      ),
    },
    {
      title: 'Passo 3: Dashboard',
      description: 'Visualize as métricas do seu ambiente',
      icon: BarChart,
      content: (
        <div className="space-y-4 py-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <BarChart className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-center">Explore o Dashboard</h3>
          <p className="text-muted-foreground text-center max-w-md mx-auto">
            Monitore a saúde dos seus dispositivos, visualize scans e receba alertas em tempo real.
          </p>
          
          <div className="grid gap-3">
            <Card className="bg-card/50 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Status dos Agentes</p>
                    <p className="text-sm text-muted-foreground">Veja quais dispositivos estão online</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Métricas de Performance</p>
                    <p className="text-sm text-muted-foreground">CPU, RAM e Disco em tempo real</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Histórico de Scans</p>
                    <p className="text-sm text-muted-foreground">Todos os scans executados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <p className="text-sm text-green-400 text-center">
              🎉 <strong>Parabéns!</strong> Você está pronto para usar o CyberShield!
            </p>
          </div>

          <Button 
            className="w-full bg-gradient-to-r from-primary to-accent"
            onClick={() => {
              localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
              onComplete();
              navigate('/admin/dashboard');
            }}
          >
            Ir para Dashboard
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    onComplete();
    navigate('/admin/dashboard');
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <DialogTitle className="text-2xl">{currentStepData.title}</DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Pular
            </Button>
          </div>
          <DialogDescription>{currentStepData.description}</DialogDescription>
          <Progress value={progress} className="mt-4" />
          <div className="text-xs text-muted-foreground text-center mt-2">
            Passo {currentStep + 1} de {steps.length}
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {currentStepData.content}
          </motion.div>
        </AnimatePresence>

        {currentStep < steps.length - 1 && (
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              Voltar
            </Button>
            <Button onClick={handleNext}>
              Próximo
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
