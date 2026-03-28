import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield, ShieldCheck, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { SecurityMetrics } from './types';

interface StatusBannerProps {
  metrics: SecurityMetrics;
  onScrollToEvents: () => void;
  onFilterCritical: () => void;
}

export function StatusBanner({ metrics, onScrollToEvents, onFilterCritical }: StatusBannerProps) {
  const m = metrics;
  const hasActivity = m.totalEvents > 0 || m.blockedIps > 0;
  const hasCritical = m.criticalEvents > 0;

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn(
        "border overflow-hidden relative",
        hasCritical ? "border-destructive/30 bg-destructive/5" :
        hasActivity ? "border-amber-500/20 bg-amber-500/5" :
        "border-emerald-500/20 bg-emerald-500/5"
      )}>
        <div className={cn(
          "absolute inset-0 opacity-5",
          hasCritical ? "bg-gradient-to-r from-destructive to-transparent" :
          hasActivity ? "bg-gradient-to-r from-amber-500 to-transparent" :
          "bg-gradient-to-r from-emerald-500 to-transparent"
        )} />
        <CardContent className="py-4 flex items-center gap-3 relative">
          {hasCritical ? (
            <>
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">
                  {m.criticalEvents} evento{m.criticalEvents > 1 ? 's' : ''} crítico{m.criticalEvents > 1 ? 's' : ''} detectado{m.criticalEvents > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">Revise os eventos abaixo e tome ações corretivas</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => {
                  onFilterCritical();
                  onScrollToEvents();
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" /> Ver eventos críticos
              </Button>
            </>
          ) : hasActivity ? (
            <>
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-500">Atividade detectada</p>
                <p className="text-xs text-muted-foreground">
                  {m.totalEvents} evento{m.totalEvents > 1 ? 's' : ''} no período
                  {m.blockedAttempts > 0 && ` · ${m.blockedAttempts} acesso${m.blockedAttempts > 1 ? 's' : ''} bloqueado${m.blockedAttempts > 1 ? 's' : ''}`}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-500">Tudo tranquilo</p>
                <p className="text-xs text-muted-foreground">Nenhuma ameaça detectada no período selecionado</p>
              </div>
              <Badge variant="outline" className="shrink-0 text-emerald-500 border-emerald-500/30 gap-1">
                <ShieldCheck className="h-3 w-3" /> Protegido
              </Badge>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
