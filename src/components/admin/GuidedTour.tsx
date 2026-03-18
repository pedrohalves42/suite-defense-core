import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Shield, Server, AlertTriangle, Brain, Bug,
  Bell, FileCheck, ChevronRight, ChevronLeft, X,
  Sparkles, GraduationCap, Lightbulb, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: LucideIcon;
  route: string;
  color: string;
  tip: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Central de Agentes',
    description: 'Aqui você gerencia todos os computadores protegidos. Veja quais estão online, instale novos agentes e monitore a saúde de cada máquina.',
    icon: Server,
    route: '/admin/agent-center',
    color: 'text-info',
    tip: '💡 Dica: Mantenha todos os agentes atualizados para máxima proteção.',
  },
  {
    title: 'Monitoramento de Segurança',
    description: 'Alertas em tempo real sobre ameaças detectadas. Classifique, investigue e resolva incidentes de segurança.',
    icon: AlertTriangle,
    route: '/admin/security-monitoring',
    color: 'text-warning',
    tip: '💡 Dica: Revise alertas críticos diariamente para evitar ameaças.',
  },
  {
    title: 'Vulnerabilidades',
    description: 'Identifique e corrija pontos fracos nos seus sistemas antes que sejam explorados por atacantes.',
    icon: Bug,
    route: '/admin/vulnerabilities',
    color: 'text-destructive',
    tip: '💡 Dica: Priorize vulnerabilidades críticas — elas são as mais perigosas.',
  },
  {
    title: 'Insights da IA',
    description: 'A inteligência artificial analisa seus dados e sugere melhorias personalizadas para sua segurança.',
    icon: Brain,
    route: '/admin/ai-insights',
    color: 'text-accent',
    tip: '💡 Dica: Aceite as sugestões da IA para melhorar sua nota de maturidade.',
  },
  {
    title: 'Notificações',
    description: 'Configure como e onde receber alertas — por email, webhook ou outros canais.',
    icon: Bell,
    route: '/admin/notification-settings',
    color: 'text-success',
    tip: '💡 Dica: Configure ao menos um canal para nunca perder um alerta.',
  },
  {
    title: 'Conformidade',
    description: 'Acompanhe sua adequação a normas como ISO 27001, NIST e LGPD com evidências automáticas.',
    icon: FileCheck,
    route: '/admin/compliance-hub',
    color: 'text-primary',
    tip: '💡 Dica: Exporte relatórios de conformidade para auditorias.',
  },
  {
    title: 'Relatórios',
    description: 'Gere relatórios executivos sobre a postura de segurança da sua organização.',
    icon: BarChart3,
    route: '/admin/reports',
    color: 'text-success',
    tip: '💡 Dica: Use relatórios para apresentar resultados à diretoria.',
  },
];

const TOUR_STORAGE_KEY = 'cybershield_guided_tour_completed';
const TOUR_DISMISSED_KEY = 'cybershield_guided_tour_dismissed';

export function GuidedTour() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    const dismissed = localStorage.getItem(TOUR_DISMISSED_KEY);
    if (!completed && !dismissed) {
      // Show after a small delay to not overwhelm on first load
      const timer = setTimeout(() => setIsOpen(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      setIsOpen(false);
    }
  }, [currentStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  }, [currentStep]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
    setIsOpen(false);
  }, []);

  const handleGoToModule = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setIsOpen(false);
    navigate(step.route);
  }, [currentStep, navigate]);

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)]"
        >
          <Card className="shadow-2xl border-2 border-primary/20 bg-card/95 backdrop-blur-xl overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <GraduationCap className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Tour Guiado
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {currentStep + 1}/{TOUR_STEPS.length}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <Progress value={progress} className="h-1 mx-4 rounded-full" />

            <CardContent className="p-4 pt-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Module icon + title */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn("p-2.5 rounded-xl bg-muted/60")}>
                      <Icon className={cn("h-5 w-5", step.color)} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">{step.title}</h3>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {step.description}
                  </p>

                  {/* Tip */}
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-accent/5 border border-accent/10 mb-4">
                    <Lightbulb className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                    <p className="text-[11px] text-accent-foreground/80 leading-relaxed">
                      {step.tip}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs gap-1"
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                      >
                        <ChevronLeft className="h-3 w-3" />
                        Anterior
                      </Button>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={handleGoToModule}
                      >
                        Ir ao módulo
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={handleNext}
                      >
                        {currentStep === TOUR_STEPS.length - 1 ? (
                          <>
                            <Sparkles className="h-3 w-3" />
                            Concluir
                          </>
                        ) : (
                          <>
                            Próximo
                            <ChevronRight className="h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Button to restart the tour manually */
export function RestartTourButton() {
  const handleRestart = () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    localStorage.removeItem(TOUR_DISMISSED_KEY);
    window.location.reload();
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-xs"
      onClick={handleRestart}
    >
      <GraduationCap className="h-3.5 w-3.5" />
      Reiniciar Tour
    </Button>
  );
}
