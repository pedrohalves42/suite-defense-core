import { useState } from 'react';
import { useTenantActionPolicies } from '@/hooks/useTenantActionPolicies';
import { INSIGHT_MAPPINGS, DEFAULT_MAPPING, type InsightExecutionMode } from '@/lib/insight-action-mapping';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings2, ShieldCheck, AlertTriangle, Ban, ArrowLeft, Save } from 'lucide-react';
import { Link } from 'react-router-dom';

type PolicyMode = 'default' | 'auto' | 'approval' | 'disabled';

// All available insight types with their default mappings
const AVAILABLE_INSIGHTS = Object.entries(INSIGHT_MAPPINGS).map(([type, mapping]) => ({
  type,
  label: mapping.human_label,
  defaultMode: mapping.mode,
  risk: mapping.risk,
}));

const MODE_LABELS: Record<PolicyMode, { label: string; icon: typeof ShieldCheck; className: string }> = {
  default: { label: 'Usar Padrão', icon: Settings2, className: 'text-muted-foreground' },
  auto: { label: 'Automático', icon: ShieldCheck, className: 'text-green-600' },
  approval: { label: 'Exigir Aprovação', icon: AlertTriangle, className: 'text-yellow-600' },
  disabled: { label: 'Desabilitado', icon: Ban, className: 'text-red-600' },
};

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function SecurityPoliciesAutoActions() {
  const { policies, policyMap, isLoading, upsertPolicy, deletePolicy } = useTenantActionPolicies();
  const [pendingChanges, setPendingChanges] = useState<Record<string, PolicyMode>>({});
  const [isSaving, setIsSaving] = useState(false);

  const getCurrentMode = (insightType: string): PolicyMode => {
    // Check pending changes first
    if (pendingChanges[insightType] !== undefined) {
      return pendingChanges[insightType];
    }
    // Then check saved policies
    const savedMode = policyMap.get(insightType);
    if (savedMode) {
      return savedMode as PolicyMode;
    }
    // Default
    return 'default';
  };

  const handleModeChange = (insightType: string, mode: PolicyMode) => {
    setPendingChanges(prev => ({
      ...prev,
      [insightType]: mode,
    }));
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      for (const [insightType, mode] of Object.entries(pendingChanges)) {
        if (mode === 'default') {
          // Remove policy to use default
          await deletePolicy.mutateAsync(insightType);
        } else {
          // Upsert policy
          await upsertPolicy.mutateAsync({
            insightType,
            executionMode: mode as 'auto' | 'approval' | 'disabled',
          });
        }
      }
      setPendingChanges({});
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/security-policies">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings2 className="h-6 w-6" />
              Políticas de Ações Automáticas
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure como o sistema deve reagir a cada tipo de insight de segurança
            </p>
          </div>
        </div>
        
        {hasChanges && (
          <Button onClick={handleSaveAll} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Salvando...' : `Salvar ${Object.keys(pendingChanges).length} alterações`}
          </Button>
        )}
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como funciona</CardTitle>
          <CardDescription>
            Cada tipo de insight tem um modo padrão definido pelo sistema. 
            Você pode sobrescrever para seu tenant específico.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span><strong>Automático:</strong> Executa sem intervenção</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span><strong>Aprovação:</strong> Aguarda decisão humana</span>
          </div>
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-600" />
            <span><strong>Desabilitado:</strong> Não executa ação</span>
          </div>
        </CardContent>
      </Card>

      {/* Policies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Políticas por Tipo de Insight</CardTitle>
          <CardDescription>
            {AVAILABLE_INSIGHTS.length} tipos de insight disponíveis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Situação</TableHead>
                <TableHead>Risco</TableHead>
                <TableHead>Padrão do Sistema</TableHead>
                <TableHead className="w-[200px]">Sua Política</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {AVAILABLE_INSIGHTS.map((insight) => {
                const currentMode = getCurrentMode(insight.type);
                const hasCustomPolicy = currentMode !== 'default';
                const isPending = pendingChanges[insight.type] !== undefined;
                
                return (
                  <TableRow key={insight.type} className={isPending ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{insight.label}</p>
                        <p className="text-xs text-muted-foreground font-mono">{insight.type}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${RISK_COLORS[insight.risk] || ''}`}>
                        {insight.risk}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {insight.defaultMode === 'auto' && <ShieldCheck className="h-3 w-3 mr-1" />}
                        {insight.defaultMode === 'approval' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {insight.defaultMode === 'suggest' && <Settings2 className="h-3 w-3 mr-1" />}
                        {insight.defaultMode}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={currentMode}
                        onValueChange={(value) => handleModeChange(insight.type, value as PolicyMode)}
                      >
                        <SelectTrigger className={hasCustomPolicy ? 'border-primary' : ''}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">
                            <div className="flex items-center gap-2">
                              <Settings2 className="h-4 w-4 text-muted-foreground" />
                              Usar Padrão ({insight.defaultMode})
                            </div>
                          </SelectItem>
                          <SelectItem value="auto">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-green-600" />
                              Automático
                            </div>
                          </SelectItem>
                          <SelectItem value="approval">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                              Exigir Aprovação
                            </div>
                          </SelectItem>
                          <SelectItem value="disabled">
                            <div className="flex items-center gap-2">
                              <Ban className="h-4 w-4 text-red-600" />
                              Desabilitado
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
