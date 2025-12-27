import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useDecisionRules } from '@/hooks/useDecisionEvents';
import { useAgentActions } from '@/hooks/useAgentActions';
import { 
  Play, 
  RefreshCw, 
  ShieldAlert, 
  Clock, 
  ShieldOff, 
  Ban,
  Loader2,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { formatBrazilDateTime } from '@/lib/date-utils';

const RULE_ICONS: Record<string, React.ReactNode> = {
  'SAFE_MODE_RULE_001': <ShieldAlert className="h-5 w-5 text-orange-500" />,
  'AGENT_THROTTLE_002': <Clock className="h-5 w-5 text-amber-500" />,
  'AGENT_ISOLATE_003': <ShieldOff className="h-5 w-5 text-red-500" />,
  'UPDATE_BLOCK_004': <Ban className="h-5 w-5 text-purple-500" />,
};

const RULE_DESCRIPTIONS: Record<string, string> = {
  'SAFE_MODE_RULE_001': 'Detecta agentes com falhas repetidas no mesmo erro e os coloca em safe mode automaticamente',
  'AGENT_THROTTLE_002': 'Aplica rate limiting em agentes com alta taxa de erros para reduzir carga no sistema',
  'AGENT_ISOLATE_003': 'Isola agentes com eventos de segurança graves, bloqueando comandos remotos',
  'UPDATE_BLOCK_004': 'Bloqueia versões de agentes com alta taxa de falha global para evitar propagação',
};

export default function RulesManagement() {
  const { data: rules, isLoading, refetch } = useDecisionRules();
  const { toggleRule, executeRulesEngine } = useAgentActions();
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  const handleToggleRule = async (ruleId: string, currentState: boolean) => {
    setTogglingRuleId(ruleId);
    try {
      await toggleRule.mutateAsync({ ruleId, isEnabled: !currentState });
    } finally {
      setTogglingRuleId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento de Regras</h1>
          <p className="text-muted-foreground">Configure as regras do motor de decisão automática</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button 
            size="sm" 
            onClick={() => executeRulesEngine.mutate()}
            disabled={executeRulesEngine.isPending}
            className="gap-1"
          >
            {executeRulesEngine.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Executar Agora
          </Button>
        </div>
      </div>

      {/* Rules Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {rules?.map((rule) => {
          const definition = rule.definition as Record<string, unknown> | null;
          const isToggling = togglingRuleId === rule.id;
          
          return (
            <Card key={rule.id} className={!rule.is_enabled ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {RULE_ICONS[rule.code] || <ShieldAlert className="h-5 w-5" />}
                    <div>
                      <CardTitle className="text-base">{rule.code}</CardTitle>
                      <CardDescription className="text-xs">{rule.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {rule.is_enabled ? (
                      <Badge variant="outline" className="bg-green-500/10 border-green-500 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Inativo
                      </Badge>
                    )}
                    <Switch
                      checked={rule.is_enabled}
                      disabled={isToggling || toggleRule.isPending}
                      onCheckedChange={() => handleToggleRule(rule.id, rule.is_enabled)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {RULE_DESCRIPTIONS[rule.code] || rule.description || 'Sem descrição'}
                </p>
                
                {definition && (
                  <div className="bg-muted/50 rounded-md p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Parâmetros:</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(definition).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground">{key}:</span>
                          <span className="font-mono">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Criada: {formatBrazilDateTime(rule.created_at, 'datetime')}</span>
                  {rule.updated_at && rule.updated_at !== rule.created_at && (
                    <span>Atualizada: {formatBrazilDateTime(rule.updated_at, 'datetime')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(!rules || rules.length === 0) && (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <p className="text-lg font-medium">Nenhuma regra configurada</p>
              <p className="text-sm text-muted-foreground">
                Execute a migração do banco de dados para criar as regras
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
