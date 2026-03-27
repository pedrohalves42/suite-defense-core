/**
 * PreserveReinstallSection - Seção de reinstalação preservando credenciais
 * 
 * Fornece comandos prontos para copiar e colar no PowerShell,
 * evitando erros de usuário como colar apenas a URL.
 * v3.2.2: comando automático por agente (sem key manual) via autenticação do painel
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Copy,
  Check,
  Terminal,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Users,
  Monitor,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { buildAgentReinstallCommand } from '@/lib/agentReinstallCommand';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const DASHBOARD_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';

// Comando seguro: baixa para arquivo temporário, verifica e executa (sem Invoke-Expression)
const INTERACTIVE_COMMAND = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cybershield-reinstall-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script?cb=$(Get-Random)" -OutFile $sp -UseBasicParsing; if (Test-Path $sp) { & $sp; Remove-Item $sp -Force } else { Write-Error 'Download failed' }`;

// Comando com Enrollment Key (deploy em massa via RMM/GPO) - com fallback de nome por hostname
const EK_COMMAND_TEMPLATE = `$env:CYBERSHIELD_KEY="COLE_SUA_ENROLLMENT_KEY"; if (-not $env:CYBERSHIELD_AGENT_NAME) { $env:CYBERSHIELD_AGENT_NAME=$env:COMPUTERNAME }; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cybershield-reinstall-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script?cb=$(Get-Random)" -OutFile $sp -UseBasicParsing; if (Test-Path $sp) { & $sp; Remove-Item $sp -Force } else { Write-Error 'Download failed' }`;

// Comando alternativo (download seguro para arquivo temporário)
const FALLBACK_COMMAND = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cybershield-reinstall-$(Get-Random).ps1"; Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script?cb=$(Get-Random)" -OutFile $sp -UseBasicParsing; if (Test-Path $sp) { & $sp; Remove-Item $sp -Force } else { Write-Error 'Download failed' }`;

// Comando de diagnóstico de rede
const NETWORK_TEST_COMMAND = `Test-NetConnection -ComputerName "${new URL(SUPABASE_URL).hostname}" -Port 443`;

interface PreserveReinstallSectionProps {
  defaultAgentName?: string | null;
}

export function PreserveReinstallSection({ defaultAgentName }: PreserveReinstallSectionProps) {
  const [copiedAuto, setCopiedAuto] = useState(false);
  const [copiedInteractive, setCopiedInteractive] = useState(false);
  const [copiedEk, setCopiedEk] = useState(false);
  const [copiedFallback, setCopiedFallback] = useState(false);
  const [copiedNetworkTest, setCopiedNetworkTest] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [autoAgentName, setAutoAgentName] = useState(defaultAgentName ?? '');
  const [autoCommand, setAutoCommand] = useState<string | null>(null);
  const [isGeneratingAuto, setIsGeneratingAuto] = useState(false);

  useEffect(() => {
    if (defaultAgentName) {
      setAutoAgentName(defaultAgentName);
    }
  }, [defaultAgentName]);

  const handleCopy = async (text: string, type: 'auto' | 'interactive' | 'ek' | 'fallback' | 'network') => {
    try {
      await navigator.clipboard.writeText(text);
      const setters: Record<string, (v: boolean) => void> = {
        auto: setCopiedAuto,
        interactive: setCopiedInteractive,
        ek: setCopiedEk,
        fallback: setCopiedFallback,
        network: setCopiedNetworkTest,
      };
      setters[type](true);
      setTimeout(() => setters[type](false), 2000);
      toast.success('Comando copiado para a área de transferência');
    } catch {
      toast.error('Falha ao copiar. Selecione o texto manualmente.');
    }
  };

  const handleGenerateAutomaticCommand = async () => {
    const agentName = autoAgentName.trim();
    if (!agentName) {
      toast.error('Informe o nome do agente para gerar o comando automático.');
      return;
    }

    try {
      setIsGeneratingAuto(true);
      const { data, error } = await supabase.functions.invoke('recover-agent-credentials', {
        body: { agent_name: agentName },
      });

      if (error) throw new Error(error.message || 'Falha ao recuperar credenciais');
      if (!data?.agentToken || !data?.hmacSecret || !data?.agentName) {
        throw new Error(data?.error || 'Resposta inválida do servidor');
      }

      const command = buildAgentReinstallCommand({
        serverUrl: SUPABASE_URL,
        fallbackServerUrl: DASHBOARD_ORIGIN,
        agentToken: data.agentToken,
        hmacSecret: data.hmacSecret,
        agentName: data.agentName,
      });

      setAutoCommand(command);
      toast.success('Comando automático gerado com autenticação do painel.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar comando automático');
    } finally {
      setIsGeneratingAuto(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
               Reinstalação Preservando Credenciais
              <Badge variant="secondary" className="ml-2 text-xs font-mono">v3.3.0</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Atualiza o agente mantendo nome, token e HMAC originais
            </CardDescription>
          </div>
          <RefreshCw className="h-5 w-5 text-primary opacity-60" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="individual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individual" className="text-xs">
              <Monitor className="h-3 w-3 mr-1" />
              Máquina Individual
            </TabsTrigger>
            <TabsTrigger value="massa" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              Em Massa (RMM/GPO)
            </TabsTrigger>
          </TabsList>

          {/* === ABA: Máquina Individual === */}
          <TabsContent value="individual" className="space-y-4 mt-3">
            <Alert className="border-primary/50 bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                Gere um comando automático autenticado pelo painel (sem digitar Enrollment Key/JWT no servidor).
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">COMO USAR:</p>
              <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
                <li>Confirme o nome exato do agente no painel</li>
                <li>Clique em <strong>Gerar Comando Automático</strong></li>
                <li>Copie e execute no PowerShell como Administrador</li>
              </ol>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Nome do agente:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={autoAgentName}
                  onChange={(e) => setAutoAgentName(e.target.value)}
                  placeholder="Ex: MIT-SERVIDOR"
                />
                <Button
                  onClick={handleGenerateAutomaticCommand}
                  disabled={isGeneratingAuto}
                  className="sm:w-auto"
                >
                  {isGeneratingAuto ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    'Gerar Comando Automático'
                  )}
                </Button>
              </div>
            </div>

            {autoCommand && (
              <div className="space-y-2">
                <p className="text-xs font-medium flex items-center gap-2">
                  Comando automático:
                  <Badge variant="outline" className="text-[10px]">Sem key manual</Badge>
                </p>
                <div className="relative">
                  <pre className="bg-muted/50 border rounded-md p-3 pr-24 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                    {autoCommand}
                  </pre>
                  <Button
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => handleCopy(autoCommand, 'auto')}
                  >
                    {copiedAuto ? (
                      <><Check className="h-3 w-3 mr-1" /> Copiado!</>
                    ) : (
                      <><Copy className="h-3 w-3 mr-1" /> Copiar Comando</>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este comando já sai autenticado e gera novas credenciais para esse agente.
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium">Fallback legado (detecção local):</p>
              <div className="relative">
                <pre className="bg-muted/50 border rounded-md p-3 pr-24 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {INTERACTIVE_COMMAND}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(INTERACTIVE_COMMAND, 'interactive')}
                >
                  {copiedInteractive ? (
                    <><Check className="h-3 w-3 mr-1" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3 mr-1" /> Copiar</>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* === ABA: Em Massa === */}
          <TabsContent value="massa" className="space-y-4 mt-3">
            <Alert className="border-primary/50 bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                <strong>Enrollment Key</strong> permite reinstalar múltiplas máquinas sem precisar de JWT individual.
                O script usa a chave para recuperar credenciais do servidor automaticamente.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">COMO USAR:</p>
              <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
                <li>
                  Vá em{' '}
                  <Link to="/super-admin/enrollment-keys" className="text-primary underline font-medium">
                    Chaves de Instalação
                  </Link>{' '}
                  e copie uma chave ativa (ou crie uma nova)
                </li>
                <li>Substitua <code className="bg-muted px-1 rounded">COLE_SUA_ENROLLMENT_KEY</code> por uma chave ativa</li>
                <li>Opcional: defina <code className="bg-muted px-1 rounded">$env:CYBERSHIELD_AGENT_NAME</code> se quiser forçar um nome específico (ex: MIT-SERVIDOR)</li>
                <li><strong>Não use JWT no campo da Enrollment Key</strong>; JWT é apenas fallback manual</li>
              </ol>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium flex items-center gap-2">
                Comando com Enrollment Key:
                <Badge variant="outline" className="text-[10px]">Recomendado para RMM</Badge>
              </p>
              <div className="relative">
                <pre className="bg-muted/50 border rounded-md p-3 pr-24 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {EK_COMMAND_TEMPLATE}
                </pre>
                <Button
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(EK_COMMAND_TEMPLATE, 'ek')}
                >
                  {copiedEk ? (
                    <><Check className="h-3 w-3 mr-1" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3 mr-1" /> Copiar Comando</>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/super-admin/enrollment-keys">
                <Button size="sm" variant="outline" className="text-xs">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Gerenciar Chaves de Instalação
                </Button>
              </Link>
            </div>
          </TabsContent>
        </Tabs>

        {/* Seção avançada (compartilhada) */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between text-xs text-muted-foreground"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="flex items-center gap-2">
            <Terminal className="h-3 w-3" />
            Opções Avançadas (proxy/firewall)
          </span>
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>

        {showAdvanced && (
          <div className="space-y-4 pt-2 border-t">
            <div className="space-y-2">
              <p className="text-xs font-medium">Comando Alternativo (melhor compatibilidade com proxy):</p>
              <div className="relative">
                <pre className="bg-muted/50 border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {FALLBACK_COMMAND}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(FALLBACK_COMMAND, 'fallback')}
                >
                  {copiedFallback ? (
                    <><Check className="h-3 w-3 mr-1" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3 mr-1" /> Copiar</>
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Testar conectividade antes de reinstalar:</p>
              <div className="relative">
                <pre className="bg-muted/50 border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {NETWORK_TEST_COMMAND}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(NETWORK_TEST_COMMAND, 'network')}
                >
                  {copiedNetworkTest ? (
                    <><Check className="h-3 w-3 mr-1" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3 mr-1" /> Copiar</>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se TcpTestSucceeded = False, verifique firewall/proxy.
              </p>
            </div>

            <div className="bg-muted/30 rounded-md p-3 text-xs space-y-2">
              <p className="font-medium">Troubleshooting:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Erro de TLS: o comando já força TLS 1.2</li>
                <li>Erro de proxy: use o comando alternativo acima</li>
                <li>Erro de parsing: verifique se não colou apenas a URL</li>
                <li>Agente não encontrado: verifique se existe em C:\CyberShield</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
