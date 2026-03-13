import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  target: string; // CSS selector
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
}

const tourSteps: TourStep[] = [
  {
    target: "[data-tour='dashboard-kpis']",
    title: "KPIs Principais",
    content: "Aqui você vê os indicadores chave: total de agentes, taxa de sucesso, ameaças detectadas e jobs ativos.",
    placement: "bottom",
  },
  {
    target: "[data-tour='dashboard-charts']",
    title: "Gráficos de Tendência",
    content: "Acompanhe a evolução temporal das instalações e detecções. Use os filtros para ajustar o período.",
    placement: "top",
  },
  {
    target: "[data-tour='dashboard-tabs']",
    title: "Tabs do Dashboard",
    content: "Navegue entre Agentes, Jobs, Relatórios, Evidências e Segurança para informações detalhadas.",
    placement: "bottom",
  },
  {
    target: "[data-tour='sidebar-nav']",
    title: "Menu de Navegação",
    content: "Use o menu lateral para acessar todas as funcionalidades: scans, quarentena, instalador e gerenciamento.",
    placement: "right",
  },
  {
    target: "[data-tour='notification-bell']",
    title: "Notificações",
    content: "O sino mostra alertas em tempo real: ameaças detectadas, jobs falhos e eventos críticos de segurança.",
    placement: "bottom",
  },
];

interface OnboardingTourProps {
  onComplete?: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("cybershield-tour-completed");
    if (!hasSeenTour) {
      // Auto-start after a brief delay on first visit to dashboard
      const timer = setTimeout(() => setIsActive(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const positionTooltip = useCallback(() => {
    const step = tourSteps[currentStep];
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    const placement = step.placement || "bottom";
    const tooltipW = 320;
    const gap = 16;

    let top = 0;
    let left = 0;

    switch (placement) {
      case "bottom":
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = rect.top - gap - 160;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "right":
        top = rect.top + rect.height / 2 - 80;
        left = rect.right + gap;
        break;
      case "left":
        top = rect.top + rect.height / 2 - 80;
        left = rect.left - gap - tooltipW;
        break;
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));
    top = Math.max(16, top);

    setTooltipPos({ top, left });
  }, [currentStep]);

  useEffect(() => {
    if (!isActive) return;
    positionTooltip();
    window.addEventListener("resize", positionTooltip);
    return () => window.removeEventListener("resize", positionTooltip);
  }, [isActive, currentStep, positionTooltip]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const completeTour = () => {
    setIsActive(false);
    localStorage.setItem("cybershield-tour-completed", "true");
    onComplete?.();
  };

  const startTour = () => {
    setCurrentStep(0);
    setIsActive(true);
  };

  if (!isActive) {
    return (
      <button
        onClick={startTour}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-accent-foreground shadow-lg hover:scale-105 transition-transform text-sm font-medium"
        title="Iniciar tour guiado"
      >
        <Sparkles className="h-4 w-4" />
        Tour Guiado
      </button>
    );
  }

  const step = tourSteps[currentStep];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998] bg-black/50 transition-opacity" onClick={completeTour} />

      {/* Highlight */}
      {highlightRect && (
        <div
          className="fixed z-[9999] rounded-lg ring-4 ring-accent/60 pointer-events-none transition-all duration-300"
          style={{
            top: highlightRect.top - 4,
            left: highlightRect.left - 4,
            width: highlightRect.width + 8,
            height: highlightRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed z-[10000] w-80 bg-card border border-border rounded-xl shadow-2xl p-5"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          <button onClick={completeTour} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-xs text-muted-foreground font-medium">
              Passo {currentStep + 1} de {tourSteps.length}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.content}</p>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentStep === 0} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <div className="flex gap-1">
              {tourSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === currentStep ? "bg-accent" : "bg-border"}`}
                />
              ))}
            </div>
            <Button size="sm" onClick={handleNext} className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90">
              {currentStep === tourSteps.length - 1 ? "Concluir" : "Próximo"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
