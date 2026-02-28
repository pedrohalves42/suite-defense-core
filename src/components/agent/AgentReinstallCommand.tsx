/**
 * AgentReinstallCommand - Generates a reinstall command for a specific agent
 * Uses recover-agent-credentials to regenerate credentials without enrollment key
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Terminal, 
  Copy, 
  Check, 
  Loader2, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AgentReinstallCommandProps {
  agentId: string;
  agentName: string;
}

const escapeForSingleQuotedPowerShell = (value: string) => value.replace(/'/g, "''");

export function AgentReinstallCommand({ agentId, agentName }: AgentReinstallCommandProps) {
  const { toast } = useToast();
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('recover-agent-credentials', {
        body: { agent_name: agentName },
      });

      if (error) throw new Error(error.message || 'Falha ao gerar credenciais');
      if (!data?.agentToken || !data?.hmacSecret) {
        throw new Error(data?.error || 'Resposta inválida do servidor');
      }

      return data as { agentToken: string; hmacSecret: string; agentName: string };
    },
    onSuccess: (data) => {
      const serverUrl = import.meta.env.VITE_SUPABASE_URL;
      const fallbackServerUrl = typeof window !== 'undefined' ? window.location.origin : '';

      const serverUrlEscaped = escapeForSingleQuotedPowerShell(serverUrl);
      const fallbackServerUrlEscaped = escapeForSingleQuotedPowerShell(fallbackServerUrl);
      const tokenEscaped = escapeForSingleQuotedPowerShell(data.agentToken);
      const hmacEscaped = escapeForSingleQuotedPowerShell(data.hmacSecret);
      const nameEscaped = escapeForSingleQuotedPowerShell(data.agentName);

      // Generate PowerShell reinstall command - kill ALL CyberShield processes/tasks first
      const parts = [
        "Get-ScheduledTask -TaskName 'CyberShield*' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue };",
        "Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID -and $_.CommandLine -match 'cybershield-agent' } | Stop-Process -Force -ErrorAction SilentlyContinue;",
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;",
        "$dir = 'C:\\CyberShield';",
        "if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };",
        "$hashDir = \"$dir\\data\"; if (!(Test-Path $hashDir)) { New-Item -ItemType Directory -Path $hashDir -Force | Out-Null };",
        "$hashJson = \"$hashDir\\expected_script_hash.json\"; $hashTxt = \"$hashDir\\expected_script_hash.txt\";",
        "if (Test-Path $hashJson) { Remove-Item $hashJson -Force -ErrorAction SilentlyContinue };",
        "if (Test-Path $hashTxt) { Remove-Item $hashTxt -Force -ErrorAction SilentlyContinue };",
        "$serverUrl = '" + serverUrlEscaped + "';",
        "$fallbackServerUrl = '" + fallbackServerUrlEscaped + "';",
        "$agentToken = '" + tokenEscaped + "';",
        "$hmacSecret = '" + hmacEscaped + "';",
        "$agentName = '" + nameEscaped + "';",
        "$baseUrls = @($serverUrl, $fallbackServerUrl) | Where-Object { $_ -and $_.Trim() -ne '' } | Select-Object -Unique;",
        "$resp = $null; $resolvedBaseUrl = $null; $lastErr = $null;",
        "foreach ($baseUrl in $baseUrls) {",
        "  try {",
        "    $url = \"$baseUrl/functions/v1/get-latest-agent-script?platform=windows&format=json&include_plain=1&cb=$(Get-Random)\";",
        "    try {",
        "      $resp = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 60 -ErrorAction Stop;",
        "    } catch {",
        "      $raw = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop).Content;",
        "      if ($raw) { $resp = $raw | ConvertFrom-Json -ErrorAction Stop }",
        "    }",
        "    if ($resp -and $resp.script_content) { $resolvedBaseUrl = $baseUrl; break }",
        "  } catch {",
        "    $lastErr = $_.Exception.Message;",
        "    Write-Host ('Falha ao baixar script em ' + $baseUrl + ': ' + $lastErr) -ForegroundColor Yellow;",
        "  }",
        "}",
        "if ($resp -and $resp.script_content) {",
        "  $effectiveServerUrl = if ($resolvedBaseUrl) { $resolvedBaseUrl } else { $serverUrl };",
        "  $scriptPath = \"$dir\\cybershield-agent-$agentName.ps1\";",
        "  $resp.script_content | Set-Content -Path $scriptPath -Encoding UTF8 -Force;",
        "  $cfg = @{ ServerUrl=$effectiveServerUrl; AgentToken=$agentToken; HMACSecret=$hmacSecret; AgentName=$agentName };",
        "  $cfg | ConvertTo-Json | Set-Content -Path \"$dir\\config.json\" -Encoding UTF8 -Force;",
        "  $arg = '-ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $scriptPath + '\" -ServerUrl \"' + $effectiveServerUrl + '\" -AgentToken \"' + $agentToken + '\" -HmacSecret \"' + $hmacSecret + '\" -AgentName \"' + $agentName + '\"';",
        "  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg;",
        "  $trigger1 = New-ScheduledTaskTrigger -AtStartup;",
        "  $trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365);",
        "  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0);",
        "  Register-ScheduledTask -TaskName 'CyberShieldAgent' -Action $action -Trigger @($trigger1,$trigger2) -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force;",
        "  Start-ScheduledTask -TaskName 'CyberShieldAgent';",
        "  Write-Host ('CyberShield reinstalado com sucesso! Endpoint: ' + $effectiveServerUrl) -ForegroundColor Green",
        "} else { Write-Host ('Erro: servidor nao retornou script. Ultimo erro: ' + $lastErr) -ForegroundColor Red }",
      ];
      const cmd = parts.join(' ');

      setCommand(cmd);
      toast({
        title: 'Comando gerado',
        description: 'Novas credenciais foram geradas. As credenciais anteriores foram revogadas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao gerar comando',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCopy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast({ title: 'Copiado!', description: 'Cole no PowerShell como Administrador.' });
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Terminal className="h-4 w-4" />
        <span className="font-medium">Comando de Reinstalação</span>
      </div>

      <Alert variant="default" className="border-warning/30 bg-warning/5">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-xs">
          Gerar um novo comando <strong>revoga as credenciais atuais</strong> do agente. 
          Use apenas se o agente não está funcionando.
        </AlertDescription>
      </Alert>

      {!command ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Gerando credenciais...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Gerar Comando de Reinstalação
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <pre className="p-3 rounded-lg bg-muted/50 border text-xs font-mono overflow-x-auto max-h-32 whitespace-pre-wrap break-all select-all">
              {command}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Execute como <strong>Administrador</strong> no PowerShell da máquina alvo.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              setCommand(null);
              generateMutation.mutate();
            }}
            disabled={generateMutation.isPending}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Regenerar com novas credenciais
          </Button>
        </div>
      )}
    </div>
  );
}