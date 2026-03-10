import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Skull, Lock, Activity, FileWarning, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRansomwareIndicators } from '@/hooks/useRansomwareIndicators';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';

const INDICATOR_CONFIG: Record<string, { label: string; icon: typeof Lock }> = {
  mass_encryption: { label: 'Criptografia em massa', icon: Lock },
  rapid_rename: { label: 'Renomeação rápida', icon: FileWarning },
  suspicious_process: { label: 'Processo suspeito', icon: Activity },
  canary_triggered: { label: 'Canário ativado', icon: AlertOctagon },
  entropy_spike: { label: 'Pico de entropia', icon: Activity },
};

export function RansomwareAlertCard() {
  const { data: summary, isLoading } = useRansomwareIndicators();

  const isUnderAttack = summary?.isUnderAttack;

  return (
    <Card className={cn(
      'transition-all',
      isUnderAttack
        ? 'border-2 border-red-500 bg-red-50/50 dark:bg-red-950/20 shadow-lg shadow-red-500/20'
        : 'border-border'
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Skull className={cn('h-4 w-4', isUnderAttack ? 'text-red-500' : '')} />
            Proteção Ransomware
          </span>
          {isUnderAttack ? (
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Badge variant="destructive" className="animate-pulse">
                ⚠ AMEAÇA ATIVA
              </Badge>
            </motion.div>
          ) : summary && summary.total > 0 ? (
            <Badge variant="outline" className="text-xs">
              {summary.contained} contido{summary.contained !== 1 ? 's' : ''}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : !summary || summary.total === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma atividade de ransomware</p>
            <p className="text-xs mt-1">Monitoramento I/O ativo ✓</p>
          </div>
        ) : (
          <div className="space-y-2">
            {summary.indicators.slice(0, 5).map(indicator => {
              const config = INDICATOR_CONFIG[indicator.indicator_type] || { label: indicator.indicator_type, icon: Activity };
              const Icon = config.icon;
              const isActive = indicator.status === 'active';

              return (
                <div key={indicator.id} className={cn(
                  'flex items-center justify-between py-2 px-3 rounded-lg border',
                  isActive 
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                    : 'border-border bg-card'
                )}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', isActive ? 'text-red-500' : 'text-muted-foreground')} />
                    <div>
                      <p className="text-sm font-medium">{config.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {indicator.affected_files_count > 0 && `${indicator.affected_files_count} arquivos • `}
                        {formatDistanceToNow(new Date(indicator.detected_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isActive ? 'destructive' : 'outline'} className="text-xs">
                    {isActive ? 'Ativo' : indicator.status === 'contained' ? 'Contido' : indicator.status}
                  </Badge>
                </div>
              );
            })}

            {isUnderAttack && (
              <div className="mt-3 p-3 rounded-lg bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800">
                <p className="text-sm font-bold text-red-800 dark:text-red-300">
                  🚨 Ação imediata necessária
                </p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                  Desconecte o endpoint da rede e contacte suporte de segurança.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
