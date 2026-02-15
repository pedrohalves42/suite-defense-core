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
      const token = data.agentToken;
      const hmac = data.hmacSecret;
      const name = data.agentName;
      
      // Generate PowerShell reinstall command - avoids backtick issues by using simple string concat
      const parts = [
        "Stop-Process -Name powershell -Force -ErrorAction SilentlyContinue;",
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;",
        "$dir = 'C:\\CyberShield';",
        "if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };",
        "$url = '" + serverUrl + "/functions/v1/serve-agent-update';",
        "$headers = @{ 'X-Agent-Token' = '" + token + "'; 'Content-Type' = 'application/json' };",
        "$body = '{\"current_version\":\"0.0.0\",\"hostname\":\"' + $env:COMPUTERNAME + '\",\"os_type\":\"windows\"}';",
        "$resp = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body;",
        "if ($resp.script_content) {",
        "  $scriptPath = \"$dir\\cybershield-agent-$env:COMPUTERNAME.ps1\";",
        "  $resp.script_content | Set-Content -Path $scriptPath -Encoding UTF8 -Force;",
        "  $cfg = @{ ServerUrl='" + serverUrl + "'; AgentToken='" + token + "'; HMACSecret='" + hmac + "'; AgentName='" + name + "' };",
        "  $cfg | ConvertTo-Json | Set-Content -Path \"$dir\\config.json\" -Encoding UTF8 -Force;",
        "  $arg = '-ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + \"$\" + 'scriptPath\" -ServerUrl \"" + serverUrl + "\" -AgentToken \"" + token + "\" -HMACSecret \"" + hmac + "\"';",
        "  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg;",
        "  $trigger = New-ScheduledTaskTrigger -AtStartup;",
        "  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1);",
        "  Unregister-ScheduledTask -TaskName 'CyberShieldAgent' -Confirm:$false -ErrorAction SilentlyContinue;",
        "  Register-ScheduledTask -TaskName 'CyberShieldAgent' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force;",
        "  Start-ScheduledTask -TaskName 'CyberShieldAgent';",
        "  Write-Host 'CyberShield reinstalado com sucesso!' -ForegroundColor Green",
        "} else { Write-Host 'Erro: servidor nao retornou script' -ForegroundColor Red }",
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