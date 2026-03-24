import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Sparkles, GripHorizontal, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TourStep {
  target: string;
  title: string;
  content: string;
  tip?: string;
  placement?: "top" | "bottom" | "left" | "right";
}

const tourSteps: TourStep[] = [
  {
    target: "[data-tour='dashboard-kpis']",
    title: "KPIs Principais",
    content: "Aqui você vê os indicadores chave: total de agentes, taxa de sucesso, ameaças detectadas e jobs ativos.",
    tip: "Clique em qualquer KPI para ver detalhes.",
    placement: "bottom",
  },
  {
    target: "[data-tour='dashboard-charts']",
    title: "Gráficos de Tendência",
    content: "Acompanhe a evolução temporal das instalações e detecções. Use os filtros para ajustar o período.",
    tip: "Use 7d, 14d ou 30d para alterar o intervalo.",
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
    tip: "Pressione Ctrl+K para busca rápida.",
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
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Drag state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("cybershield-tour-completed");
    if (!hasSeenTour) {
      const timer = setTimeout(() => setIsActive(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Position panel near target element initially
  const positionNearTarget = useCallback(() => {
    const step = tourSteps[currentStep];
    const el = document.querySelector(step.target);
    if (!el) {
      // Default to bottom-right
      setPos({ x: window.innerWidth - 440, y: window.innerHeight - 360 });
      return;
    }

    const rect = el.getBoundingClientRect();
    setHighlightRect(rect);

    const panelW = 420;
    const panelH = 280;
    const gap = 16;

    let x = rect.right + gap;
    let y = rect.top;

    // If overflows right, try left
    if (x + panelW > window.innerWidth - 16) {
      x = rect.left - panelW - gap;
    }
    // If overflows left, place below
    if (x < 16) {
      x = rect.left + rect.width / 2 - panelW / 2;
      y = rect.bottom + gap;
    }

    // Clamp
    x = Math.max(16, Math.min(x, window.innerWidth - panelW - 16));
    y = Math.max(16, Math.min(y, window.innerHeight - panelH - 16));

    setPos({ x, y });
  }, [currentStep]);

  useEffect(() => {
    if (!isActive) return;
    positionNearTarget();
    const onResize = () => {
      // Update highlight only on resize, keep panel where user dragged
      const step = tourSteps[currentStep];
      const el = document.querySelector(step.target);
      if (el) setHighlightRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isActive, currentStep, positionNearTarget]);

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(dragRef.current.origX + dx, window.innerWidth - 100)),
        y: Math.max(0, Math.min(dragRef.current.origY + dy, window.innerHeight - 60)),
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [pos]);

  // Touch drag
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragRef.current = { startX: touch.clientX, startY: touch.clientY, origX: pos.x, origY: pos.y };

    const onTouchMove = (ev: TouchEvent) => {
      if (!dragRef.current) return;
      const t = ev.touches[0];
      const dx = t.clientX - dragRef.current.startX;
      const dy = t.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(dragRef.current.origX + dx, window.innerWidth - 100)),
        y: Math.max(0, Math.min(dragRef.current.origY + dy, window.innerHeight - 60)),
      });
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      dragRef.current = null;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  }, [pos]);

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

  const goToTarget = () => {
    const step = tourSteps[currentStep];
    const el = document.querySelector(step.target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setHighlightRect(rect);
      }, 400);
    }
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
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  return (
    <>
      {/* Subtle overlay - clickable to dismiss */}
      <div className="fixed inset-0 z-[9998] bg-black/30 transition-opacity" onClick={completeTour} />

      {/* Highlight ring on target */}
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

      {/* Draggable Tour Panel */}
      <div
        ref={panelRef}
        className="fixed z-[10000] select-none"
        style={{
          top: pos.y,
          left: pos.x,
          cursor: isDragging ? "grabbing" : "auto",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`panel-${currentStep}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            style={{ width: isExpanded ? 420 : 280 }}
          >
            {/* Drag handle header */}
            <div
              className="flex items-center justify-between px-4 py-2.5 bg-accent/10 border-b border-border cursor-grab active:cursor-grabbing"
              onMouseDown={onMouseDown}
              onTouchStart={onTouchStart}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Tour Guiado {currentStep + 1}/{tourSteps.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
                  title={isExpanded ? "Minimizar" : "Expandir"}
                >
                  {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={completeTour}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  title="Fechar tour"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <div
                className="h-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Content */}
            {isExpanded && (
              <div className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-accent/10 border border-accent/20 shrink-0">
                    <Sparkles className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>
                  </div>
                </div>

                {step.tip && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/10 mb-4">
                    <span className="text-accent text-sm">💡</span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-medium text-foreground">Dica:</span> {step.tip}
                    </p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrev}
                    disabled={currentStep === 0}
                    className="gap-1 text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                  </Button>

                  <button
                    onClick={goToTarget}
                    className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
                  >
                    Ir ao módulo →
                  </button>

                  <Button
                    size="sm"
                    onClick={handleNext}
                    className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90 text-xs"
                  >
                    {currentStep === tourSteps.length - 1 ? "Concluir" : "Próximo"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Step dots */}
                <div className="flex justify-center gap-1.5 mt-3">
                  {tourSteps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentStep(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === currentStep
                          ? "bg-accent w-5"
                          : i < currentStep
                          ? "bg-accent/40"
                          : "bg-border"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
