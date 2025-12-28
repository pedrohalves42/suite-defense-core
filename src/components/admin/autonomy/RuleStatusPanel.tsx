import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Gavel, AlertTriangle, Shield, Zap, CheckCircle } from 'lucide-react';

interface DecisionRule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  severity: string;
  risk_level: string;
  auto_execute: boolean;
  is_active: boolean;
  created_at: string;
}

interface RuleStatusPanelProps {
  rules: DecisionRule[];
  isLoading: boolean;
  decisionsByRule?: Array<{ rule_code: string; count: number }>;
}

const severityConfig: Record<string, { color: string; icon: typeof AlertTriangle }> = {
  low: { color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
  medium: { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: AlertTriangle },
  high: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: AlertTriangle },
  critical: { color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: Shield },
};

export function RuleStatusPanel({ rules, isLoading, decisionsByRule }: RuleStatusPanelProps) {
  const getDecisionCount = (ruleCode: string) => {
    return decisionsByRule?.find((d) => d.rule_code === ruleCode)?.count ?? 0;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" />
            Regras Ativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rules.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" />
            Regras Ativas
          </CardTitle>
          <CardDescription>Regras de decisão do sistema autônomo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Gavel className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma regra ativa configurada</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-primary" />
          Regras Ativas
        </CardTitle>
        <CardDescription>
          {rules.length} regras ativas • {rules.filter((r) => r.auto_execute).length} com auto-execução
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {rules.map((rule) => {
              const config = severityConfig[rule.severity] || severityConfig.medium;
              const Icon = config.icon;
              const count = getDecisionCount(rule.code);

              return (
                <div
                  key={rule.id}
                  className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex gap-3">
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {rule.code}
                        </Badge>
                      </div>
                      {rule.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {rule.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <Badge className={config.color}>
                          {rule.severity}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Risco: {rule.risk_level}
                        </Badge>
                        {count > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {count} decisões
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Auto</span>
                      <Switch
                        checked={rule.auto_execute}
                        disabled
                        className="data-[state=checked]:bg-green-500"
                      />
                    </div>
                    {rule.auto_execute && (
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                        <Zap className="h-3 w-3 mr-1" />
                        Automático
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
