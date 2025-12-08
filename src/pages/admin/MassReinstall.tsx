import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, AlertTriangle, CheckCircle, Terminal, FileText, Download, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CLEANUP_SCRIPT = `# =========================================
# CyberShield - Script de Limpeza Completa
# Execute como Administrador no PowerShell
# =========================================

Write-Host "=== CyberShield Cleanup Script ===" -ForegroundColor Cyan

# 1. Parar processos do agente
Write-Host "[1/4] Parando processos..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.ProcessName -like "*powershell*" -and $_.MainWindowTitle -like "*CyberShield*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object { $_.Path -like "*CyberShield*" } | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Remover Scheduled Tasks
Write-Host "[2/4] Removendo Scheduled Tasks..." -ForegroundColor Yellow
Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" } | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
schtasks /delete /tn "CyberShield Agent" /f 2>$null
schtasks /delete /tn "CyberShieldAgent" /f 2>$null

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
Remove-Item -Path "$env:TEMP\\cybershield*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Limpeza Concluída ===" -ForegroundColor Green
Write-Host ""
Write-Host "PRÓXIMO PASSO:" -ForegroundColor Cyan
Write-Host "1. Acesse o dashboard e gere uma nova Enrollment Key" -ForegroundColor White
Write-Host "2. Copie o comando de instalação" -ForegroundColor White
Write-Host "3. Execute o comando de instalação neste terminal" -ForegroundColor White
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
    $files = Get-ChildItem "C:\\CyberShield" -File
    Write-Host "    Pasta existe com $($files.Count) arquivos" -ForegroundColor Green
    $files | ForEach-Object { Write-Host "    - $($_.Name) ($([math]::Round($_.Length/1KB, 2)) KB)" -ForegroundColor Gray }
} else {
    Write-Host "    Pasta NÃO encontrada" -ForegroundColor Red
}

# Verificar Scheduled Tasks
Write-Host ""
Write-Host "[2] Scheduled Tasks:" -ForegroundColor Yellow
$tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like "*CyberShield*" }
if ($tasks) {
    $tasks | ForEach-Object { 
        Write-Host "    - $($_.TaskName): $($_.State)" -ForegroundColor $(if($_.State -eq 'Ready'){'Green'}else{'Yellow'})
    }
} else {
    Write-Host "    Nenhuma task encontrada" -ForegroundColor Red
}

# Verificar processos
Write-Host ""
Write-Host "[3] Processos Ativos:" -ForegroundColor Yellow
$procs = Get-Process | Where-Object { $_.Path -like "*CyberShield*" }
if ($procs) {
    $procs | ForEach-Object { Write-Host "    - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Green }
} else {
    Write-Host "    Nenhum processo CyberShield ativo" -ForegroundColor Gray
}

# Verificar versão do agente
Write-Host ""
Write-Host "[4] Versão do Agente:" -ForegroundColor Yellow
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
Write-Host "[5] Últimos Logs:" -ForegroundColor Yellow
$logFile = "C:\\CyberShield\\agent.log"
if (Test-Path $logFile) {
    Get-Content $logFile -Tail 10 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "    Arquivo de log não encontrado" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Diagnóstico Concluído ===" -ForegroundColor Cyan
`;

export default function MassReinstall() {
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  // Buscar agentes problemáticos (v3.10.21 ou anterior)
  const { data: problematicAgents, isLoading } = useQuery({
    queryKey: ['problematic-agents-for-reinstall'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('id, agent_name, hostname, agent_version, last_heartbeat, status')
        .order('agent_name');
      
      if (error) throw error;
      
      // Filtrar agentes que precisam reinstalação (v3.10.21 ou anterior)
      return (data || []).filter(agent => {
        if (!agent.agent_version) return true;
        const match = agent.agent_version.match(/v?(\d+)\.(\d+)\.(\d+)/);
        if (!match) return true;
        const [, major, minor, patch] = match.map(Number);
        // Versões <= 3.10.21 precisam reinstalação
        return major < 3 || (major === 3 && minor < 10) || (major === 3 && minor === 10 && patch <= 21);
      });
    }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reinstalação em Massa</h1>
        <p className="text-muted-foreground mt-1">
          Procedimento para reinstalar agentes com versões antigas que não suportam auto-update
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Atenção: Reinstalação Manual Necessária</AlertTitle>
        <AlertDescription>
          Agentes na versão v3.10.21 ou anterior possuem um bug no caminho do script que impede o auto-update.
          É necessário reinstalação manual única em cada máquina. Após reinstalar, futuras atualizações serão automáticas.
        </AlertDescription>
      </Alert>

      {/* Status dos agentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Computadores que Precisam Reinstalação
          </CardTitle>
          <CardDescription>
            {isLoading ? 'Carregando...' : `${problematicAgents?.length || 0} computadores identificados`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">Carregando...</div>
          ) : problematicAgents && problematicAgents.length > 0 ? (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {problematicAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="font-medium">{agent.agent_name}</span>
                      {agent.hostname && (
                        <span className="text-muted-foreground ml-2">({agent.hostname})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                        {agent.status}
                      </Badge>
                      <Badge variant="outline">
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
              <p>Todos os agentes estão em versões compatíveis com auto-update</p>
            </div>
          )}
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
                Execute este script como Administrador para remover completamente o agente antigo
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

              <ScrollArea className="h-[300px] w-full rounded-md border bg-muted/30 p-4">
                <pre className="text-sm font-mono whitespace-pre-wrap">{CLEANUP_SCRIPT}</pre>
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
                Execute para verificar o estado atual do agente antes/depois da reinstalação
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

              <ScrollArea className="h-[300px] w-full rounded-md border bg-muted/30 p-4">
                <pre className="text-sm font-mono whitespace-pre-wrap">{DIAGNOSTIC_SCRIPT}</pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Instruções passo-a-passo */}
      <Card>
        <CardHeader>
          <CardTitle>Procedimento de Reinstalação</CardTitle>
          <CardDescription>Siga estes passos para cada computador que precisa reinstalação</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-4">
            <li className="text-foreground">
              <strong>Acesse o computador</strong>
              <p className="text-muted-foreground ml-6 mt-1">
                Conecte via acesso remoto ou presencialmente ao computador que precisa reinstalação
              </p>
            </li>
            <li className="text-foreground">
              <strong>Abra o PowerShell como Administrador</strong>
              <p className="text-muted-foreground ml-6 mt-1">
                Clique direito no menu Iniciar → Windows PowerShell (Admin)
              </p>
            </li>
            <li className="text-foreground">
              <strong>Execute o Script de Limpeza</strong>
              <p className="text-muted-foreground ml-6 mt-1">
                Cole e execute o script de limpeza para remover o agente antigo completamente
              </p>
            </li>
            <li className="text-foreground">
              <strong>Gere nova Enrollment Key</strong>
              <p className="text-muted-foreground ml-6 mt-1">
                Acesse <a href="/admin/enrollment-keys" className="text-primary underline">/admin/enrollment-keys</a> e gere uma nova chave
              </p>
            </li>
            <li className="text-foreground">
              <strong>Execute o Instalador</strong>
              <p className="text-muted-foreground ml-6 mt-1">
                Copie o comando de instalação e execute no mesmo terminal PowerShell
              </p>
            </li>
            <li className="text-foreground">
              <strong>Verifique o Status</strong>
              <p className="text-muted-foreground ml-6 mt-1">
                Aguarde 1-2 minutos e verifique se o agente aparece como "Conectado" no dashboard
              </p>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
