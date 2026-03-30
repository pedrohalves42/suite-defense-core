import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HelpTooltip } from '@/components/ui/tech-tooltip';
import { type LucideIcon } from 'lucide-react';

interface SLOMetricCardProps {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  tooltipTerm: string;
  description: string;
  current: number;
  target: number;
  errorBudgetUsed: number;
  status: 'healthy' | 'warning' | 'critical';
}

function getStatusBadge(status: 'healthy' | 'warning' | 'critical') {
  switch (status) {
    case 'healthy': return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">OK</Badge>;
    case 'warning': return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">Atenção</Badge>;
    case 'critical': return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">Problema</Badge>;
  }
}

function getErrorBudgetMessage(used: number): string {
  if (used <= 20) return "Ótimo! Margem de segurança ampla";
  if (used <= 50) return "Bom, ainda há margem confortável";
  if (used <= 80) return "Atenção, margem diminuindo";
  return "Crítico! Limite quase atingido";
}

export function SLOMetricCard({ icon: Icon, iconColor, title, tooltipTerm, description, current, target, errorBudgetUsed, status }: SLOMetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            {title}
            <HelpTooltip term={tooltipTerm} />
          </span>
          {getStatusBadge(status)}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className="text-4xl font-bold text-green-500">{current.toFixed(0)}%</div>
          <p className="text-sm text-muted-foreground mt-1">Meta: {target}%</p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-1">Margem de falha usada <HelpTooltip term="margem de falha" /></span>
            <span>{errorBudgetUsed.toFixed(0)}%</span>
          </div>
          <Progress value={errorBudgetUsed} className="h-2" />
          <p className="text-xs text-muted-foreground">{getErrorBudgetMessage(errorBudgetUsed)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
