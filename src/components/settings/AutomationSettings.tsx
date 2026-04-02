import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Shield, 
  Zap, 
  AlertTriangle, 
  Settings2, 
  Info,
  Loader2,
  CheckCircle
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type AutoActionMode = 'off' | 'suggest' | 'auto_low' | 'auto_all';

const AUTOMATION_MODES: {
  value: AutoActionMode;
  label: string;
  description: string;
  icon: typeof Shield;
  risk: 'low' | 'medium' | 'high';
}[] = [
  {
    value: 'off',
    label: 'Desativado',
    description: 'Nenhuma ação automática. Todas as ações requerem aprovação manual.',
    icon: Shield,
    risk: 'low',
  },
  {
    value: 'suggest',
    label: 'Apenas Sugestões',
    description: 'Sistema sugere ações, mas não executa automaticamente. Você decide o que fazer.',
    icon: Info,
    risk: 'low',
  },
  {
    value: 'auto_low',
    label: 'Automação Leve',
    description: 'Executa automaticamente ações de baixo risco (limpeza, alertas). Ações de médio/alto risco requerem aprovação.',
    icon: Zap,
    risk: 'medium',
  },
  {
    value: 'auto_all',
    label: 'Automação Completa',
    description: 'Executa automaticamente todas as ações que não requerem aprovação explícita. Recomendado apenas para ambientes maduros.',
    icon: AlertTriangle,
    risk: 'high',
  },
];

export function AutomationSettings() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [pendingMode, setPendingMode] = useState<AutoActionMode | null>(null);

  // Fetch current automation mode
  const { data: currentMode, isLoading } = useQuery({
    queryKey: ['tenant-automation-mode', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return 'suggest';
      
      const { data, error } = await supabase
        .from('tenants_safe')
        .select('auto_action_mode')
        .eq('id', tenant.id)
        .single();
      
      if (error) throw error;
      return (data?.auto_action_mode as AutoActionMode) || 'suggest';
    },
    enabled: !!tenant?.id,
  });

  // Update mutation
  const updateMode = useMutation({
    mutationFn: async (mode: AutoActionMode) => {
      if (!tenant?.id) throw new Error('Tenant não encontrado');
      
      const { error } = await supabase
        .from('tenants')
        .update({ auto_action_mode: mode })
        .eq('id', tenant.id);
      
      if (error) throw error;
      return mode;
    },
    onSuccess: (mode) => {
      toast.success(`Modo de automação alterado para: ${AUTOMATION_MODES.find(m => m.value === mode)?.label}`);
      queryClient.invalidateQueries({ queryKey: ['tenant-automation-mode'] });
      setPendingMode(null);
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    },
  });

  const selectedMode = pendingMode || currentMode || 'suggest';
  const hasChanges = pendingMode !== null && pendingMode !== currentMode;

  const getRiskBadge = (risk: 'low' | 'medium' | 'high') => {
    const variants = {
      low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      high: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    const labels = { low: 'Baixo Risco', medium: 'Médio Risco', high: 'Alto Risco' };
    
    return (
      <Badge variant="outline" className={cn("ml-2 text-xs", variants[risk])}>
        {labels[risk]}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Nível de Automação
        </CardTitle>
        <CardDescription>
          Configure quanto o sistema pode agir automaticamente em resposta a eventos de segurança.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={selectedMode}
          onValueChange={(value) => setPendingMode(value as AutoActionMode)}
          className="space-y-4"
        >
          {AUTOMATION_MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = selectedMode === mode.value;
            const isCurrent = currentMode === mode.value;
            
            return (
              <div
                key={mode.value}
                className={cn(
                  "flex items-start space-x-4 p-4 rounded-lg border transition-all cursor-pointer",
                  isSelected 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
                onClick={() => setPendingMode(mode.value)}
              >
                <RadioGroupItem value={mode.value} id={mode.value} className="mt-1" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center">
                    <Icon className={cn(
                      "h-4 w-4 mr-2",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )} />
                    <Label 
                      htmlFor={mode.value} 
                      className="font-medium cursor-pointer"
                    >
                      {mode.label}
                    </Label>
                    {getRiskBadge(mode.risk)}
                    {isCurrent && !hasChanges && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Atual
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {mode.description}
                  </p>
                </div>
              </div>
            );
          })}
        </RadioGroup>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {hasChanges ? (
              <span className="text-yellow-600 dark:text-yellow-400">
                Você tem alterações não salvas
              </span>
            ) : (
              'Modo atual: ' + AUTOMATION_MODES.find(m => m.value === currentMode)?.label
            )}
          </div>
          <div className="flex gap-2">
            {hasChanges && (
              <Button 
                variant="outline" 
                onClick={() => setPendingMode(null)}
              >
                Cancelar
              </Button>
            )}
            <Button
              onClick={() => pendingMode && updateMode.mutate(pendingMode)}
              disabled={!hasChanges || updateMode.isPending}
            >
              {updateMode.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </div>
        </div>

        {selectedMode === 'auto_all' && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Atenção: Automação Completa
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Este modo executa ações automaticamente sem intervenção humana. 
                  Certifique-se de que seus playbooks e políticas estão bem configurados 
                  antes de ativar.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
