import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, AlertTriangle, Info, CheckCircle, XCircle, Lightbulb } from 'lucide-react';
import { translateAlert, getSeverityColor, getSeverityLabel, type TranslatedAlert } from '@/lib/alert-translator';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HumanizedAlertCardProps {
  alertType: string;
  agentName?: string;
  value?: number;
  threshold?: number;
  timestamp?: string;
  onDismiss?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  compact?: boolean;
}

export function HumanizedAlertCard({
  alertType,
  agentName,
  value,
  threshold,
  timestamp,
  onDismiss,
  onAction,
  actionLabel = 'Resolver',
  compact = false,
}: HumanizedAlertCardProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  
  const translated = translateAlert(alertType, {
    agentName,
    value,
    threshold,
  });

  const SeverityIcon = {
    critical: XCircle,
    high: AlertTriangle,
    medium: AlertTriangle,
    low: Info,
    info: Info,
  }[translated.severity];

  const iconColors = {
    critical: 'text-red-500',
    high: 'text-orange-500',
    medium: 'text-yellow-500',
    low: 'text-blue-500',
    info: 'text-gray-500',
  };

  if (compact) {
    return (
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <Card className={`border-l-4 ${translated.severity === 'critical' ? 'border-l-red-500' : translated.severity === 'high' ? 'border-l-orange-500' : translated.severity === 'medium' ? 'border-l-yellow-500' : 'border-l-blue-500'}`}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{translated.icon}</span>
                  <div>
                    <CardTitle className="text-sm font-medium">{translated.title}</CardTitle>
                    {agentName && (
                      <CardDescription className="text-xs">
                        Computador: {agentName}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getSeverityColor(translated.severity)}>
                    {getSeverityLabel(translated.severity)}
                  </Badge>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <AnimatePresence>
            {isExpanded && (
              <CollapsibleContent forceMount>
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <CardContent className="pt-0 pb-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {translated.description}
                    </p>
                    
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                            Impacto para o negócio
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {translated.businessImpact}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-blue-800 dark:text-blue-300">
                            O que fazer
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-400">
                            {translated.recommendation}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      {onAction && (
                        <Button size="sm" onClick={onAction}>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {actionLabel}
                        </Button>
                      )}
                      {onDismiss && (
                        <Button size="sm" variant="outline" onClick={onDismiss}>
                          Dispensar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </motion.div>
              </CollapsibleContent>
            )}
          </AnimatePresence>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Card className={`border-l-4 ${translated.severity === 'critical' ? 'border-l-red-500' : translated.severity === 'high' ? 'border-l-orange-500' : translated.severity === 'medium' ? 'border-l-yellow-500' : 'border-l-blue-500'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${getSeverityColor(translated.severity)}`}>
              <SeverityIcon className={`h-5 w-5 ${iconColors[translated.severity]}`} />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span>{translated.icon}</span>
                {translated.title}
              </CardTitle>
              {agentName && (
                <CardDescription>
                  Computador: {agentName}
                  {timestamp && ` • ${new Date(timestamp).toLocaleString('pt-BR')}`}
                </CardDescription>
              )}
            </div>
          </div>
          <Badge className={getSeverityColor(translated.severity)}>
            {getSeverityLabel(translated.severity)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {translated.description}
        </p>
        
        <div className="grid gap-3 md:grid-cols-2">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Impacto para o negócio
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  {translated.businessImpact}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  O que fazer agora
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  {translated.recommendation}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {(onAction || onDismiss) && (
          <div className="flex gap-2 pt-2">
            {onAction && (
              <Button onClick={onAction}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {actionLabel}
              </Button>
            )}
            {onDismiss && (
              <Button variant="outline" onClick={onDismiss}>
                Dispensar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Lista de alertas humanizados
 */
interface HumanizedAlertListProps {
  alerts: Array<{
    id: string;
    type: string;
    agentName?: string;
    value?: number;
    timestamp?: string;
  }>;
  onDismiss?: (id: string) => void;
  onAction?: (id: string) => void;
}

export function HumanizedAlertList({ alerts, onDismiss, onAction }: HumanizedAlertListProps) {
  if (alerts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
          <p className="text-lg font-medium text-green-700 dark:text-green-400">
            Tudo certo!
          </p>
          <p className="text-sm text-muted-foreground">
            Não há alertas que precisam de atenção no momento.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <HumanizedAlertCard
          key={alert.id}
          alertType={alert.type}
          agentName={alert.agentName}
          value={alert.value}
          timestamp={alert.timestamp}
          onDismiss={onDismiss ? () => onDismiss(alert.id) : undefined}
          onAction={onAction ? () => onAction(alert.id) : undefined}
          compact
        />
      ))}
    </div>
  );
}
