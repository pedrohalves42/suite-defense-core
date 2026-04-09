import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AdminPageLayout } from '@/components/AdminPageLayout';
import { Download, RefreshCw, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { FRAMEWORKS } from './constants';
import { ControlRow } from './ControlRow';
import { useComplianceAutomation } from './useComplianceAutomation';

export default function ComplianceAutomation() {
  const {
    activeFramework,
    setActiveFramework,
    activeFrameworkData,
    controls,
    compliantCount,
    partialCount,
    nonCompliantCount,
    totalControls,
    complianceScore,
    isLoading,
    isCollecting,
    evidenceResult,
    savedStatuses,
    handleAutoFill,
    handleSaveControl,
  } = useComplianceAutomation();

  const FrameworkIcon = activeFrameworkData.icon;

  if (isLoading) {
    return (
      <AdminPageLayout title="Conformidade Automática" description="Mapeamento automático de frameworks">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Conformidade Automática"
      description="Mapeamento automático ISO 27001, SOC 2, LGPD e NIST CSF"
    >
      <div className="space-y-6">
        {/* Framework Selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FRAMEWORKS.map((fw) => {
            const Icon = fw.icon;
            const isActive = activeFramework === fw.id;
            return (
              <Card
                key={fw.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md',
                  isActive && 'ring-2 ring-primary border-primary'
                )}
                onClick={() => setActiveFramework(fw.id)}
              >
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    <span className={cn('font-semibold text-sm', isActive && 'text-primary')}>{fw.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{fw.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Score Overview */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex items-center gap-4 flex-1">
                <div className={cn(
                  'h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold',
                  complianceScore >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                  complianceScore >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                )}>
                  {complianceScore}%
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{activeFrameworkData.name}</h3>
                  <p className="text-sm text-muted-foreground">{activeFrameworkData.description}</p>
                  <div className="flex gap-3 mt-2">
                    <span className="text-xs"><span className="font-medium text-green-600">{compliantCount}</span> conformes</span>
                    <span className="text-xs"><span className="font-medium text-amber-600">{partialCount}</span> parciais</span>
                    <span className="text-xs"><span className="font-medium text-red-600">{nonCompliantCount}</span> não conformes</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {activeFramework === 'soc2' && (
                  <Button variant="default" size="sm" onClick={handleAutoFill} disabled={isCollecting}>
                    {isCollecting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Auto-preencher
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-4 w-4 mr-2" />
                  Gerar Relatório
                </Button>
              </div>
            </div>
            <Progress value={complianceScore} className="mt-4 h-2" />
          </CardContent>
        </Card>

        {/* Evidence collection result banner */}
        {evidenceResult && activeFramework === 'soc2' && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>
                  Última coleta: <strong>{evidenceResult.evidence.length}</strong> evidências em{' '}
                  <strong>{evidenceResult.controls.length}</strong> controles
                  {evidenceResult.saved && ' • Salvo no banco'}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(evidenceResult.timestamp).toLocaleString('pt-BR')}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Controls List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FrameworkIcon className="h-5 w-5" />
              Controles - {activeFrameworkData.name}
            </CardTitle>
            <CardDescription>
              {totalControls} controles mapeados
              {activeFramework === 'soc2' && evidenceResult
                ? ' • Dados reais do sistema'
                : activeFramework === 'soc2'
                ? ' • Clique em "Auto-preencher" para coletar evidências'
                : ' automaticamente'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {controls.map((control) => (
                <ControlRow
                  key={control.id}
                  control={control}
                  savedNotes={savedStatuses?.[control.controlId]?.notes ?? null}
                  onSave={handleSaveControl}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
