import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PlayCircle, CheckCircle2, XCircle, Clock, Server, Activity, AlertCircle, Trash2,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { formatBrazilTime } from '@/lib/date-utils';
import { useAgentTest } from './useAgentTest';
import type { TestResult } from './useAgentTest';

function getStatusIcon(status: TestResult['status']) {
  switch (status) {
    case 'success': return <CheckCircle2 className="h-5 w-5 text-success" />;
    case 'error': return <XCircle className="h-5 w-5 text-destructive" />;
    case 'running': return <Clock className="h-5 w-5 text-primary animate-pulse" />;
    default: return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

function getStatusBadge(status: TestResult['status']) {
  const variants = { success: 'default', error: 'destructive', running: 'secondary', pending: 'outline' } as const;
  return <Badge variant={variants[status]}>{status}</Badge>;
}

export default function AgentTest() {
  const {
    agents, testResults, selectedAgent, setSelectedAgent,
    cleanupMutation, runIntegrationTest,
  } = useAgentTest();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teste de Integração de Computadores</h1>
          <p className="text-muted-foreground mt-2">
            Valide o fluxo completo: criar verificação, polling, execução, relatório e confirmação
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm"><Trash2 className="w-4 h-4 mr-2" />Limpar Dados de Teste</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Limpeza de Dados</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>Esta acao ira remover permanentemente:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Todos os computadores</li>
                    <li>Todas as credenciais de acesso</li>
                    <li>Todos os eventos de telemetria</li>
                    <li>Todas as métricas de sistema</li>
                    <li>Chaves de cadastro usadas</li>
                  </ul>
                  <p className="font-semibold mt-4">Os usuarios serao mantidos.</p>
                  <p className="text-destructive">Esta acao nao pode ser desfeita.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => cleanupMutation.mutate()} disabled={cleanupMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {cleanupMutation.isPending && <Clock className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar Limpeza
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Selecionar Computador para Teste</CardTitle>
            <CardDescription>Escolha um computador ativo para executar o teste de integração</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {agents?.map((agent: any) => (
                  <Button key={agent.id} variant={selectedAgent === agent.agent_name ? 'default' : 'outline'} className="w-full justify-start" onClick={() => setSelectedAgent(agent.agent_name)}>
                    <div className="flex items-center gap-3 w-full">
                      <Activity className="h-4 w-4" />
                      <div className="flex-1 text-left">
                        <div className="font-medium">{agent.agent_name}</div>
                        <div className="text-xs text-muted-foreground">Status: {agent.status}</div>
                      </div>
                      <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>{agent.status}</Badge>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
            <Separator className="my-4" />
            <Button onClick={() => selectedAgent && runIntegrationTest.mutate(selectedAgent)} disabled={!selectedAgent || runIntegrationTest.isPending} className="w-full" size="lg">
              <PlayCircle className="h-5 w-5 mr-2" />
              {runIntegrationTest.isPending ? 'Executando Teste...' : 'Iniciar Teste de Integracao'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultados do Teste</CardTitle>
            <CardDescription>Linha do tempo da execução do fluxo de integração</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px]">
              {testResults.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Selecione um computador e inicie o teste</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {testResults.map((result, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <div className="mt-0.5">{getStatusIcon(result.status)}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{result.step}</span>
                          {getStatusBadge(result.status)}
                        </div>
                        <p className="text-sm text-muted-foreground">{result.message}</p>
                        {result.data && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver dados</summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">{JSON.stringify(result.data, null, 2)}</pre>
                          </details>
                        )}
                        <p className="text-xs text-muted-foreground">{formatBrazilTime(result.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Como Funciona o Teste</CardTitle></CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <ol className="space-y-2">
            <li><strong>Criar Verificação de Teste:</strong> Sistema cria uma verificação tipo "report" para o computador selecionado</li>
            <li><strong>Polling do Computador:</strong> Aguarda até 120s para o computador buscar e receber a verificação</li>
            <li><strong>Upload de Relatório:</strong> Aguarda até 60s para o computador executar a verificação e enviar o relatório</li>
            <li><strong>Confirmação:</strong> Aguarda até 30s para o computador confirmar a conclusão da verificação</li>
            <li><strong>Validação:</strong> Se todas as etapas completarem com sucesso, o fluxo está funcionando corretamente</li>
          </ol>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Troubleshooting:</p>
            <ul className="text-sm space-y-1">
              <li>? Se o polling falhar: Verifique se o agent esta rodando e conectado</li>
              <li>? Se o report falhar: Verifique os logs do agent para erros de execucao</li>
              <li>? Se o ACK falhar: Verifique a conectividade do agent com o servidor</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
