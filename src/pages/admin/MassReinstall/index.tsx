import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Copy, AlertTriangle, CheckCircle, Terminal, FileText, Download, RefreshCw, WifiOff, Key, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMassReinstall } from './useMassReinstall';
import { CLEANUP_SCRIPT, DIAGNOSTIC_SCRIPT } from './scripts';

export default function MassReinstall() {
  const {
    offlineAgents, isLoading, refetch,
    copiedScript, enrollmentKey, setEnrollmentKey,
    copyToClipboard, downloadScript,
    getReinstallCommand, getFullCommand, formatLastHeartbeat,
  } = useMassReinstall();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reinstalação em Massa</h1>
        <p className="text-muted-foreground mt-1">Procedimento para reinstalar agentes offline devido a bug no atualizador</p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Reinstalação Manual Necessária</AlertTitle>
        <AlertDescription>
          Os agentes abaixo estão offline devido a um bug no auto-update (versões v3.10.29/v3.10.30).
          É necessário reinstalação manual única em cada máquina.
        </AlertDescription>
      </Alert>

      {/* Offline Agents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WifiOff className="h-5 w-5 text-destructive" />
                Computadores Offline ({offlineAgents?.length || 0})
              </CardTitle>
              <CardDescription>Computadores que precisam reinstalação manual</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">Carregando...</div>
          ) : offlineAgents && offlineAgents.length > 0 ? (
            <ScrollArea className="h-[250px]">
              <div className="space-y-2">
                {offlineAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-destructive/20">
                    <div className="flex items-center gap-3">
                      <WifiOff className="h-4 w-4 text-destructive" />
                      <div>
                        <span className="font-medium">{agent.agent_name}</span>
                        {agent.hostname && <span className="text-muted-foreground ml-2 text-sm">({agent.hostname})</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-destructive border-destructive/50">{formatLastHeartbeat(agent.last_heartbeat)}</Badge>
                      <Badge variant="secondary">{agent.agent_version || 'N/A'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p className="font-medium">Todos os agentes estão online!</p>
              <p className="text-sm">Nenhuma reinstalação necessária</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reinstall Command */}
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5 text-primary" />Comando de Reinstalação</CardTitle>
          <CardDescription>Cole a Enrollment Key e copie o comando para executar em cada PC</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input placeholder="Cole a Enrollment Key aqui (ex: XXXX-XXXX-XXXX-XXXX)" value={enrollmentKey} onChange={(e) => setEnrollmentKey(e.target.value)} className="font-mono" />
            </div>
            <Link to="/super-admin/enrollment-keys">
              <Button variant="outline"><ExternalLink className="h-4 w-4 mr-2" />Gerar Nova Key</Button>
            </Link>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Comando Completo (Limpeza + Instalação):</span>
              <Button size="sm" onClick={() => copyToClipboard(getFullCommand(enrollmentKey), 'full')} disabled={!enrollmentKey.trim()} variant={copiedScript === 'full' ? 'default' : 'outline'}>
                <Copy className="h-4 w-4 mr-2" />{copiedScript === 'full' ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>
            <div className="bg-muted/50 rounded-md p-3 border">
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{getFullCommand(enrollmentKey)}</pre>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Apenas Instalação (se já limpou):</span>
              <Button size="sm" onClick={() => copyToClipboard(getReinstallCommand(enrollmentKey), 'install')} disabled={!enrollmentKey.trim()} variant={copiedScript === 'install' ? 'default' : 'outline'}>
                <Copy className="h-4 w-4 mr-2" />{copiedScript === 'install' ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>
            <div className="bg-muted/50 rounded-md p-3 border">
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{getReinstallCommand(enrollmentKey)}</pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scripts Tabs */}
      <Tabs defaultValue="cleanup" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cleanup">Script de Limpeza</TabsTrigger>
          <TabsTrigger value="diagnostic">Script de Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="cleanup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" />Script de Limpeza Completa</CardTitle>
              <CardDescription>Execute este script separadamente se o comando completo não funcionar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={() => copyToClipboard(CLEANUP_SCRIPT, 'cleanup')} variant={copiedScript === 'cleanup' ? 'default' : 'outline'}>
                  <Copy className="h-4 w-4 mr-2" />{copiedScript === 'cleanup' ? 'Copiado!' : 'Copiar Script'}
                </Button>
                <Button variant="outline" onClick={() => downloadScript(CLEANUP_SCRIPT, 'CyberShield-Cleanup.ps1')}>
                  <Download className="h-4 w-4 mr-2" />Baixar .ps1
                </Button>
              </div>
              <ScrollArea className="h-[200px] w-full rounded-md border bg-muted/30 p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">{CLEANUP_SCRIPT}</pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnostic">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Script de Diagnóstico</CardTitle>
              <CardDescription>Execute para verificar o estado do agente antes/depois da reinstalação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button onClick={() => copyToClipboard(DIAGNOSTIC_SCRIPT, 'diagnostic')} variant={copiedScript === 'diagnostic' ? 'default' : 'outline'}>
                  <Copy className="h-4 w-4 mr-2" />{copiedScript === 'diagnostic' ? 'Copiado!' : 'Copiar Script'}
                </Button>
                <Button variant="outline" onClick={() => downloadScript(DIAGNOSTIC_SCRIPT, 'CyberShield-Diagnostic.ps1')}>
                  <Download className="h-4 w-4 mr-2" />Baixar .ps1
                </Button>
              </div>
              <ScrollArea className="h-[200px] w-full rounded-md border bg-muted/30 p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">{DIAGNOSTIC_SCRIPT}</pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Step-by-step instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Procedimento de Reinstalação</CardTitle>
          <CardDescription>Siga estes passos para cada computador offline</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-3 text-sm">
            <li className="text-foreground"><strong>Gere uma Enrollment Key</strong> (limite de uso: {offlineAgents?.length || 11} ou mais)
              <Link to="/super-admin/enrollment-keys" className="text-primary ml-2 underline">Ir para Enrollment Keys →</Link>
            </li>
            <li className="text-foreground"><strong>Cole a Key acima</strong> para gerar os comandos de reinstalação</li>
            <li className="text-foreground"><strong>Em cada PC:</strong> Abra PowerShell como Administrador (Win + X → Terminal Admin)</li>
            <li className="text-foreground"><strong>Cole e execute</strong> o "Comando Completo" (limpeza + instalação)</li>
            <li className="text-foreground"><strong>Aguarde 1-2 minutos</strong> e verifique se o agente aparece como "Conectado" no dashboard</li>
          </ol>
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-md">
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Tempo estimado:</strong> ~2-3 minutos por PC | Total: ~{Math.ceil((offlineAgents?.length || 11) * 2.5)} minutos
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
