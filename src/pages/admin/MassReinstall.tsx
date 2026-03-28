import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Copy, AlertTriangle, CheckCircle, Terminal, FileText, Download, RefreshCw, Wifi, WifiOff, Key, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const CLEANUP_SCRIPT = `# =========================================
# CyberShield - Script de Limpeza Completa
# Execute como Administrador no PowerShell
# =========================================

Write-Host "=== CyberShield Cleanup Script ===" -ForegroundColor Cyan

# 1. Parar Scheduled Tasks
Write-Host "[1/4] Parando e removendo Scheduled Tasks..." -ForegroundColor Yellow
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "    Removido: $($_.TaskName)" -ForegroundColor Gray
}

# 2. Parar processos do agente
Write-Host "[2/4] Parando processos..." -ForegroundColor Yellow
Get-Process -Name "powershell*" -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*cybershield*" -or $_.CommandLine -like "*CyberShield*" 
} | Stop-Process -Force -ErrorAction SilentlyContinue

# 3. Remover pasta de instalação
Write-Host "[3/4] Removendo pasta C:\\CyberShield..." -ForegroundColor Yellow
if (Test-Path "C:\\CyberShield") {
    Remove-Item -Path "C:\\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    Pasta removida com sucesso" -ForegroundColor Green
} else {
    Write-Host "    Pasta não encontrada (já removida)" -ForegroundColor Gray
}

# 4. Limpar registros temporários
Write-Host "[4/4] Limpando arquivos temporários..." -ForegroundColor Yellow
Remove-Item -Path "$env:TEMP\\install-windows*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:TEMP\\cybershield*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Limpeza Concluída ===" -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMO PASSO: Execute o comando de reinstalacao abaixo" -ForegroundColor Cyan
Write-Host ""
`;

const DIAGNOSTIC_SCRIPT = `# =========================================
# CyberShield - Script de Diagnóstico
# Execute como Administrador no PowerShell
# =========================================

Write-Host "=== CyberShield Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Verificar pasta de instalação
Write-Host "[1] Pasta de Instalação:" -ForegroundColor Yellow
if (Test-Path "C:\\CyberShield") {
    $files = Get-ChildItem "C:\\CyberShield" -File -ErrorAction SilentlyContinue
    Write-Host "    Pasta existe com $($files.Count) arquivos" -ForegroundColor Green
    $files | ForEach-Object { Write-Host "    - $($_.Name) ($([math]::Round($_.Length/1KB, 2)) KB)" -ForegroundColor Gray }
} else {
    Write-Host "    Pasta NAO encontrada" -ForegroundColor Red
}

# Verificar Scheduled Tasks
Write-Host ""
Write-Host "[2] Scheduled Tasks:" -ForegroundColor Yellow
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | ForEach-Object { 
        Write-Host "    - $($_.TaskName): $($_.State)" -ForegroundColor $(if($_.State -eq 'Running'){'Green'}elseif($_.State -eq 'Ready'){'Yellow'}else{'Red'})
    }
} else {
    Write-Host "    Nenhuma task encontrada" -ForegroundColor Red
}

# Verificar versão do agente
Write-Host ""
Write-Host "[3] Versão do Agente:" -ForegroundColor Yellow
$scriptFiles = Get-ChildItem "C:\\CyberShield\\*.ps1" -ErrorAction SilentlyContinue
if ($scriptFiles) {
    foreach ($script in $scriptFiles) {
        $content = Get-Content $script.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match 'Version:\\s*([\\w\\d\\.-]+)') {
            Write-Host "    $($script.Name): $($Matches[1])" -ForegroundColor Green
        }
    }
} else {
    Write-Host "    Nenhum script encontrado" -ForegroundColor Red
}

# Verificar logs recentes
Write-Host ""
Write-Host "[4] Últimos Logs:" -ForegroundColor Yellow
$logPaths = @("C:\\CyberShield\\logs\\agent.log", "C:\\CyberShield\\agent.log")
$foundLog = $false
foreach ($logPath in $logPaths) {
    if (Test-Path $logPath) {
        Get-Content $logPath -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        $foundLog = $true
        break
    }
}
if (-not $foundLog) {
    Write-Host "    Arquivo de log não encontrado" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Diagnóstico Concluído ===" -ForegroundColor Cyan
`;

export default function MassReinstall() {
  const adaptiveInterval = useAdaptivePolling(300_000);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [enrollmentKey, setEnrollmentKey] = useState<string>('');
  const { tenant } = useTenant();

  // Buscar agentes offline (sem heartbeat nos últimos 5 minutos)
  const { data: offlineAgents, isLoading, refetch } = useQuery({
    queryKey: ['offline-agents-for-reinstall', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: rawData, error } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false,
      });
      
      if (error) throw error;
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30min - matches AGENT_STATUS_THRESHOLDS
      const agents = ((rawData as any as Array<{id: string; agent_name: string; hostname: string; agent_version: string; last_heartbeat: string | null; status: string}>) || [])
        .filter(a => !a.last_heartbeat || a.last_heartbeat < cutoff)
        .sort((a, b) => (a.agent_name || '').localeCompare(b.agent_name || ''));
      return agents;
    },
    enabled: !!tenant?.id,
    refetchInterval: adaptiveInterval,
  });

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(type);
    toast.success('Copiado para a área de transferência');
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const downloadScript = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Script ${filename} baixado`);
  };

  // Gerar comando de reinstalação
  const getReinstallCommand = (key: string) => {
    if (!key.trim()) return '# Cole sua Enrollment Key acima para gerar o comando';
    return `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/serve-installer/${key.trim()}?os_type=windows" -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`;
  };

  // Gerar comando completo (limpeza + reinstalação)
  const getFullCommand = (key: string) => {
    if (!key.trim()) return '# Cole sua Enrollment Key acima para gerar o comando';
    return `# Limpeza + Reinstalação em um único comando
Get-ScheduledTask -TaskName "CyberShield*" -EA 0 | Unregister-ScheduledTask -Confirm:$false -EA 0; Remove-Item "C:\\CyberShield" -Recurse -Force -EA 0; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/serve-installer/${key.trim()}?os_type=windows" -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`;
  };

  const formatLastHeartbeat = (lastHeartbeat: string | null) => {
    if (!lastHeartbeat) return 'Nunca conectou';
    const date = new Date(lastHeartbeat);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d atrás`;
    if (diffHours > 0) return `${diffHours}h atrás`;
    return `${diffMins}min atrás`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reinstalação em Massa</h1>
        <p className="text-muted-foreground mt-1">
          Procedimento para reinstalar agentes offline devido a bug no atualizador
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Reinstalação Manual Necessária</AlertTitle>
        <AlertDescription>
          Os agentes abaixo estão offline devido a um bug no auto-update (versões v3.10.29/v3.10.30).
          É necessário reinstalação manual única em cada máquina. Após reinstalar na versão atual, 
          futuras atualizações serão automáticas.
        </AlertDescription>
      </Alert>

      {/* Agentes Offline */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <WifiOff className="h-5 w-5 text-destructive" />
                Computadores Offline ({offlineAgents?.length || 0})
              </CardTitle>
              <CardDescription>
                Computadores que precisam reinstalação manual
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
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
                        {agent.hostname && (
                          <span className="text-muted-foreground ml-2 text-sm">({agent.hostname})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-destructive border-destructive/50">
                        {formatLastHeartbeat(agent.last_heartbeat)}
                      </Badge>
                      <Badge variant="secondary">
                        {agent.agent_version || 'N/A'}
                      </Badge>
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

      {/* Comando de Reinstalação */}
      <Card className="border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Comando de Reinstalação
          </CardTitle>
          <CardDescription>
            Cole a Enrollment Key e copie o comando para executar em cada PC
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Link para gerar key */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="Cole a Enrollment Key aqui (ex: XXXX-XXXX-XXXX-XXXX)"
                value={enrollmentKey}
                onChange={(e) => setEnrollmentKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <Link to="/super-admin/enrollment-keys">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Gerar Nova Key
              </Button>
            </Link>
          </div>

          {/* Comando simples */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Comando Completo (Limpeza + Instalação):</span>
              <Button 
                size="sm"
                onClick={() => copyToClipboard(getFullCommand(enrollmentKey), 'full')}
                disabled={!enrollmentKey.trim()}
                variant={copiedScript === 'full' ? 'default' : 'outline'}
              >
                <Copy className="h-4 w-4 mr-2" />
                {copiedScript === 'full' ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>
            <div className="bg-muted/50 rounded-md p-3 border">
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                {getFullCommand(enrollmentKey)}
              </pre>
            </div>
          </div>

          {/* Comando só instalação */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Apenas Instalação (se já limpou):</span>
              <Button 
                size="sm"
                onClick={() => copyToClipboard(getReinstallCommand(enrollmentKey), 'install')}
                disabled={!enrollmentKey.trim()}
                variant={copiedScript === 'install' ? 'default' : 'outline'}
              >
                <Copy className="h-4 w-4 mr-2" />
                {copiedScript === 'install' ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>
            <div className="bg-muted/50 rounded-md p-3 border">
              <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                {getReinstallCommand(enrollmentKey)}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scripts */}
      <Tabs defaultValue="cleanup" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cleanup">Script de Limpeza</TabsTrigger>
          <TabsTrigger value="diagnostic">Script de Diagnóstico</TabsTrigger>
        </TabsList>

        <TabsContent value="cleanup">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Script de Limpeza Completa
              </CardTitle>
              <CardDescription>
                Execute este script separadamente se o comando completo não funcionar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={() => copyToClipboard(CLEANUP_SCRIPT, 'cleanup')}
                  variant={copiedScript === 'cleanup' ? 'default' : 'outline'}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copiedScript === 'cleanup' ? 'Copiado!' : 'Copiar Script'}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => downloadScript(CLEANUP_SCRIPT, 'CyberShield-Cleanup.ps1')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar .ps1
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
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Script de Diagnóstico
              </CardTitle>
              <CardDescription>
                Execute para verificar o estado do agente antes/depois da reinstalação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  onClick={() => copyToClipboard(DIAGNOSTIC_SCRIPT, 'diagnostic')}
                  variant={copiedScript === 'diagnostic' ? 'default' : 'outline'}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copiedScript === 'diagnostic' ? 'Copiado!' : 'Copiar Script'}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => downloadScript(DIAGNOSTIC_SCRIPT, 'CyberShield-Diagnostic.ps1')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar .ps1
                </Button>
              </div>

              <ScrollArea className="h-[200px] w-full rounded-md border bg-muted/30 p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap">{DIAGNOSTIC_SCRIPT}</pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Instruções passo-a-passo */}
      <Card>
        <CardHeader>
          <CardTitle>Procedimento de Reinstalação</CardTitle>
          <CardDescription>Siga estes passos para cada computador offline</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-3 text-sm">
            <li className="text-foreground">
              <strong>Gere uma Enrollment Key</strong> (limite de uso: {offlineAgents?.length || 11} ou mais)
              <Link to="/super-admin/enrollment-keys" className="text-primary ml-2 underline">
                Ir para Enrollment Keys →
              </Link>
            </li>
            <li className="text-foreground">
              <strong>Cole a Key acima</strong> para gerar os comandos de reinstalação
            </li>
            <li className="text-foreground">
              <strong>Em cada PC:</strong> Abra PowerShell como Administrador (Win + X → Terminal Admin)
            </li>
            <li className="text-foreground">
              <strong>Cole e execute</strong> o "Comando Completo" (limpeza + instalação)
            </li>
            <li className="text-foreground">
              <strong>Aguarde 1-2 minutos</strong> e verifique se o agente aparece como "Conectado" no dashboard
            </li>
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
