import { Eye, Glasses } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSimpleModeContext } from '@/hooks/useSimpleMode';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Toggle para alternar entre modo Técnico e modo Simples
 * 
 * Modo Simples: Semáforo (verde/amarelo/vermelho), linguagem de negócio
 * Modo Técnico: Métricas completas, logs, detalhes para TI
 */
export function SimpleModeToggle() {
  const { isSimple, toggleMode } = useSimpleModeContext();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleMode}
          className={cn(
            "gap-2 transition-all",
            isSimple 
              ? "bg-success/10 border-success/30 text-success hover:bg-success/20" 
              : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
          )}
        >
          {isSimple ? (
            <>
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Visão Simples</span>
            </>
          ) : (
            <>
              <Glasses className="h-4 w-4" />
              <span className="hidden sm:inline">Visão Técnica</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="max-w-xs">
          {isSimple ? (
            <p>
              <strong>Modo Simples ativo</strong><br />
              Interface resumida com status em cores.<br />
              Clique para ver detalhes técnicos.
            </p>
          ) : (
            <p>
              <strong>Modo Técnico ativo</strong><br />
              Métricas completas e logs detalhados.<br />
              Clique para visão simplificada.
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Componente menor para usar na sidebar
 */
export function SimpleModeToggleCompact() {
  const { isSimple, toggleMode } = useSimpleModeContext();

  return (
    <button
      onClick={toggleMode}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-all",
        isSimple 
          ? "bg-success/10 text-success hover:bg-success/20" 
          : "bg-muted hover:bg-muted/80"
      )}
    >
      {isSimple ? <Eye className="h-4 w-4" /> : <Glasses className="h-4 w-4" />}
      <span>{isSimple ? 'Visão Simples' : 'Visão Técnica'}</span>
    </button>
  );
}
