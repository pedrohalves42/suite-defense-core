/**
 * ExplainableAlert - Alertas com Explicação Expandível
 * 
 * Para usuários leigos: mostra o problema de forma clara,
 * com analogias e ações sugeridas.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  Lightbulb,
  Zap
} from 'lucide-react';
import { getAlertExplanation, ALERT_TYPE_LABELS } from '@/lib/leigo-translator';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'error';

interface ExplainableAlertProps {
  type: keyof typeof ALERT_TYPE_LABELS | string;
  severity?: AlertSeverity;
  /** Real alert title from the database (overrides generic type label) */
  alertTitle?: string;
  /** Real alert message from the database (overrides generic explanation) */
  alertMessage?: string;
  showAnalogy?: boolean;
  showActions?: boolean;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'ghost';
  }>;
  className?: string;
  children?: React.ReactNode;
}

const severityConfig = {
  info: {
    icon: Info,
    containerClass: 'border-info/30 bg-info/5',
    iconClass: 'text-info',
  },
  success: {
    icon: CheckCircle2,
    containerClass: 'border-success/30 bg-success/5',
    iconClass: 'text-success',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'border-warning/30 bg-warning/5',
    iconClass: 'text-warning',
  },
  error: {
    icon: AlertCircle,
    containerClass: 'border-destructive/30 bg-destructive/5',
    iconClass: 'text-destructive',
  },
};

export function ExplainableAlert({
  type,
  severity = 'warning',
  alertTitle,
  alertMessage,
  showAnalogy = true,
  showActions = true,
  actions,
  className,
  children,
}: ExplainableAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const explanation = getAlertExplanation(type);
  const config = severityConfig[severity];
  const Icon = config.icon;

  // Use real alert data when available, fall back to generic type labels
  const displayTitle = alertTitle || explanation.title;
  const displayMessage = alertMessage || explanation.explanation;
  
  return (
    <Alert className={cn(config.containerClass, 'transition-all duration-200', className)}>
      <div className="flex items-start gap-3">
        {explanation.icon && (
          <span className="text-2xl" role="img" aria-label={displayTitle}>
            {explanation.icon}
          </span>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <AlertTitle className="flex items-center gap-2 text-base">
              <Icon className={cn('h-4 w-4', config.iconClass)} />
              {displayTitle}
            </AlertTitle>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              {isExpanded ? (
                <>
                  Menos <ChevronUp className="h-3 w-3 ml-1" />
                </>
              ) : (
                <>
                  Mais <ChevronDown className="h-3 w-3 ml-1" />
                </>
              )}
            </Button>
          </div>
          
          <AlertDescription className="mt-1 text-sm">
            {displayMessage}
          </AlertDescription>
          
          {/* Conteúdo expandido */}
          {isExpanded && (
            <div className="mt-3 space-y-3 animate-slide-in">
              {showAnalogy && explanation.analogy && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                  <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground italic">
                    {explanation.analogy}
                  </p>
                </div>
              )}
              
              {showActions && explanation.urgency && (
                <div className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-medium">
                    {explanation.urgency}
                  </p>
                </div>
              )}
              
              {children}
            </div>
          )}
          
          {/* Botões de ação */}
          {actions && actions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || (index === 0 ? 'default' : 'outline')}
                  size="sm"
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Alert>
  );
}

// Versão compacta para listas
interface CompactAlertProps {
  type: keyof typeof ALERT_TYPE_LABELS | string;
  severity?: AlertSeverity;
  alertTitle?: string;
  onClick?: () => void;
  className?: string;
}

export function CompactAlert({ type, severity = 'warning', alertTitle, onClick, className }: CompactAlertProps) {
  const explanation = getAlertExplanation(type);
  const config = severityConfig[severity];
  const Icon = config.icon;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-colors hover:bg-accent/50',
        config.containerClass,
        className
      )}
    >
      <div className="flex items-center gap-2">
        {explanation.icon && (
          <span className="text-lg" role="img" aria-label={alertTitle || explanation.title}>
            {explanation.icon}
          </span>
        )}
        <Icon className={cn('h-4 w-4', config.iconClass)} />
        <span className="font-medium text-sm">{alertTitle || explanation.title}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 ml-10">
        {explanation.explanation}
      </p>
    </button>
  );
}
