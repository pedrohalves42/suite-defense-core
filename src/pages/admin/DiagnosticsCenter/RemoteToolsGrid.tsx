import type { RpcAgentRow } from '@/types/rpc';
import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import type { Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DiagnosticTestRunner } from '@/components/admin/DiagnosticTestRunner';
import { PreserveReinstallSection } from '@/components/admin/PreserveReinstallSection';
import { supabase } from '@/integrations/supabase/client';
import { prepareJobForInsert } from '@/lib/job-utils';
import { toast } from 'sonner';
import {
  Activity, FileText, Settings, RefreshCw, Globe, History,
  Wifi, Stethoscope, Wrench, Download, Trash2, Network, Zap,
  CheckCircle2, Clock,
} from 'lucide-react';
import type { ProblematicAgent } from './types';

interface RemoteToolsGridProps {
  selectedAgent: RpcAgentRow;
  selectedAgentId: string | null;
  tenantId: string;
  problematicAgents: ProblematicAgent[];
  queryClient: QueryClient;
  navigate: NavigateFunction;
  onCleanupAgent: (agent: ProblematicAgent) => void;
  onBulkCleanup: () => void;
  onDownloadReinstallScript: () => void;
}

async function createJob(tenantId: string, agent: RpcAgentRow, type: string, payload: Record<string, unknown>, successMsg: string) {
  const job = await prepareJobForInsert({
    tenant_id: tenantId,
    agent_id: agent.id,
    agent_name: agent.agent_name,
    type,
    status: 'queued',
    payload,
  });
  await supabase.from('jobs').insert([job]);
  toast.success(successMsg);
}

const toolCards = [
  { icon: Activity, color: 'text-green-500', title: 'Testar Conectividade', desc: 'Envia ping ao agente para confirmar comunicação', type: 'ping', payload: { source: 'diagnostics_center' }, msg: 'Ping enviado! Aguarde resultado.', btnIcon: Zap, btnLabel: 'Testar Agora' },
  { icon: FileText, color: 'text-blue-500', title: 'Coletar Logs', desc: 'Solicita upload dos logs das últimas 24h', type: 'collect_logs', payload: { source: 'diagnostics_center', period: '24h' }, msg: 'Coleta de logs solicitada!', btnIcon: Download, btnLabel: 'Solicitar Logs' },
  { icon: Settings, color: 'text-purple-500', title: 'Verificar Serviços', desc: 'Lista status dos componentes do agente', type: 'check_services', payload: { source: 'diagnostics_center' }, msg: 'Verificação de serviços iniciada!', btnIcon: CheckCircle2, btnLabel: 'Verificar' },
  { icon: RefreshCw, color: 'text-orange-500', title: 'Forçar Health Report', desc: 'Solicita métricas atualizadas imediatamente', type: 'health_report', payload: { source: 'diagnostics_center', priority: 'high' }, msg: 'Relatório de saúde solicitado!', btnIcon: Zap, btnLabel: 'Executar' },
  { icon: Globe, color: 'text-cyan-500', title: 'Testar DNS', desc: 'Verifica resolução de nomes do agente', type: 'test_dns', payload: { source: 'diagnostics_center', targets: ['google.com', 'microsoft.com'] }, msg: 'Teste de DNS iniciado!', btnIcon: Network, btnLabel: 'Testar' },
] as const;

export function RemoteToolsGrid({
  selectedAgent,
  selectedAgentId,
  tenantId,
  problematicAgents,
  queryClient,
  navigate,
  onCleanupAgent,
  onBulkCleanup,
  onDownloadReinstallScript,
}: RemoteToolsGridProps) {
  return (
    <div className="space-y-4">
      {/* Remote Diagnostic Tools */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Wifi className="h-4 w-4" />
          Diagnóstico Remoto
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {toolCards.map((tool) => {
            const BtnIcon = tool.btnIcon;
            return (
              <Card key={tool.type}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <tool.icon className={`h-4 w-4 ${tool.color}`} />
                    {tool.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">{tool.desc}</p>
                  <Button
                    size="sm"
                    onClick={() => createJob(tenantId, selectedAgent, tool.type, { ...tool.payload }, tool.msg)}
                  >
                    <BtnIcon className="h-3 w-3 mr-2" />
                    {tool.btnLabel}
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          {/* History card (navigates instead of creating job) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-500" />
                Histórico Heartbeats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">Últimos 50 heartbeats com latência</p>
              <Button size="sm" onClick={() => navigate(`/admin/agent-timeline?agent=${selectedAgentId}`)}>
                <Clock className="h-3 w-3 mr-2" />
                Ver Histórico
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Test Battery */}
      <div className="mb-6">
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Stethoscope className="h-4 w-4" />
          Bateria de Testes
        </h4>
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Testar Todas as Ferramentas
            </CardTitle>
            <CardDescription>
              Execute uma sequência de testes para verificar as ferramentas de diagnóstico
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DiagnosticTestRunner
              agentId={selectedAgentId}
              agentName={selectedAgent?.agent_name}
              onComplete={() => queryClient.invalidateQueries({ queryKey: ['jobs'] })}
            />
          </CardContent>
        </Card>
      </div>

      {/* Preserve Reinstall Section */}
      <div className="mb-6">
        <PreserveReinstallSection defaultAgentName={selectedAgent?.agent_name ?? null} />
      </div>

      {/* Clean install tools */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Reinstalação Limpa (novo registro)
        </h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Download className="h-4 w-4" />
                Script de Reinstalação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Script PowerShell para reinstalar o agente remotamente
              </p>
              <Button size="sm" onClick={onDownloadReinstallScript}>
                <Download className="h-3 w-3 mr-2" />
                Baixar Script
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                Limpar Registro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Remove registros problemáticos para permitir nova instalação
              </p>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const probAgent = problematicAgents.find(a => a.id === selectedAgentId);
                  if (probAgent) onCleanupAgent(probAgent);
                  else toast.info('Este computador não está na lista de problemáticos');
                }}
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Limpar e Resetar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bulk cleanup */}
      {problematicAgents.length > 1 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Limpeza em Massa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Remove todos os {problematicAgents.length} computadores problemáticos de uma vez
            </p>
            <Button size="sm" variant="destructive" onClick={onBulkCleanup}>
              Limpar Todos ({problematicAgents.length})
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
