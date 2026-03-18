import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  GraduationCap, ChevronRight, AlertTriangle, 
  Info, AlertCircle, Sparkles, Shield
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSecurityAdvisor, type SecurityTip } from '@/hooks/useSecurityAdvisor';

const severityConfig = {
  critical: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', badge: 'destructive' as const },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', badge: 'secondary' as const },
  info: { icon: Info, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20', badge: 'outline' as const },
};

const maturityConfig = {
  basic: { color: 'text-destructive', progressColor: 'bg-destructive', label: '🔴 Básico' },
  intermediate: { color: 'text-warning', progressColor: 'bg-warning', label: '🟡 Intermediário' },
  advanced: { color: 'text-success', progressColor: 'bg-success', label: '🟢 Avançado' },
};

function TipCard({ tip, index }: { tip: SecurityTip; index: number }) {
  const navigate = useNavigate();
  const config = severityConfig[tip.severity];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <div className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50",
        config.border, config.bg
      )}>
        <div className={cn("p-1.5 rounded-md shrink-0 mt-0.5", config.bg)}>
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold truncate">{tip.title}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {tip.description}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 h-7 text-xs gap-1"
          onClick={() => navigate(tip.actionPath)}
        >
          {tip.actionLabel}
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );
}

export function SecurityAdvisorCard() {
  const { data, isLoading, error } = useSecurityAdvisor();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  const { tips, maturity } = data;
  const mConfig = maturityConfig[maturity.level];

  // No tips = all good
  if (tips.length === 0) {
    return (
      <Card className="border-success/20 bg-gradient-to-r from-success/5 to-transparent">
        <CardContent className="py-4 flex items-center gap-3">
          <div className="p-2 rounded-full bg-success/10">
            <Shield className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-success">Segurança em dia!</p>
            <p className="text-xs text-muted-foreground">
              Não encontramos melhorias pendentes. Continue monitorando.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            Assistente de Segurança
          </CardTitle>
          <Badge variant="outline" className="text-[10px] gap-1">
            <GraduationCap className="h-3 w-3" />
            Nível: {maturity.label}
          </Badge>
        </div>
        {/* Maturity progress */}
        <div className="flex items-center gap-3 mt-2">
          <Progress value={maturity.score} className="h-1.5 flex-1" />
          <span className={cn("text-xs font-bold tabular-nums", mConfig.color)}>
            {maturity.score}%
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {maturity.level === 'basic' && 'Há melhorias importantes para proteger sua rede. Siga as dicas abaixo.'}
          {maturity.level === 'intermediate' && 'Bom progresso! Algumas melhorias vão fortalecer ainda mais sua segurança.'}
          {maturity.level === 'advanced' && 'Excelente! Sua segurança está bem configurada. Pequenos ajustes podem ser feitos.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {tips.map((tip, i) => (
          <TipCard key={`${tip.actionPath}-${i}`} tip={tip} index={i} />
        ))}
      </CardContent>
    </Card>
  );
}
