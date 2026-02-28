/**
 * PreserveReinstallSection - Seção de reinstalação preservando credenciais
 * 
 * Fornece comandos prontos para copiar e colar no PowerShell,
 * evitando erros de usuário como colar apenas a URL.
 * v3.2.0: Comando atualizado com cache-bust + envio correto de Enrollment Key
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Copy, 
  Check, 
  Terminal, 
  Shield, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Key,
  Users,
  Monitor,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Comando interativo (máquina individual - detecta credenciais locais e força versão mais recente)
const INTERACTIVE_COMMAND = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script?cb=$(Get-Random)" | iex`;

// Comando com Enrollment Key (deploy em massa via RMM/GPO) - agora injeta a key corretamente
const EK_COMMAND_TEMPLATE = `$env:CYBERSHIELD_KEY="COLE_SUA_ENROLLMENT_KEY"; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script?cb=$(Get-Random)" | iex`;

// Comando alternativo (Invoke-WebRequest + cache-bust - melhor compatibilidade com proxy)
const FALLBACK_COMMAND = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $script = (Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script?cb=$(Get-Random)" -UseBasicParsing).Content; Invoke-Expression $script`;

// Comando de diagnóstico de rede
const NETWORK_TEST_COMMAND = `Test-NetConnection -ComputerName "${new URL(SUPABASE_URL).hostname}" -Port 443`;

export function PreserveReinstallSection() {
  const [copiedInteractive, setCopiedInteractive] = useState(false);
  const [copiedEk, setCopiedEk] = useState(false);
  const [copiedFallback, setCopiedFallback] = useState(false);
  const [copiedNetworkTest, setCopiedNetworkTest] = useState(false);
  const [copiedJwt, setCopiedJwt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCopy = async (text: string, type: 'interactive' | 'ek' | 'fallback' | 'network') => {
    try {
      await navigator.clipboard.writeText(text);
      const setters: Record<string, (v: boolean) => void> = {
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

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Reinstalação Preservando Credenciais
              <Badge variant="secondary" className="ml-2 text-xs">v3.2.0</Badge>
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
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">COMO USAR:</p>
              <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
                <li>Abra o <strong>PowerShell como Administrador</strong></li>
                <li>Clique em "Copiar Comando" abaixo</li>
                <li>Cole no PowerShell (Ctrl+V ou clique direito)</li>
                <li>Pressione Enter e aguarde finalizar</li>
                <li>Se pedir Enrollment Key ou JWT, use os botões abaixo</li>
              </ol>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">Comando:</p>
              <div className="relative">
                <pre className="bg-muted/50 border rounded-md p-3 pr-24 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
                  {INTERACTIVE_COMMAND}
                </pre>
                <Button
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(INTERACTIVE_COMMAND, 'interactive')}
                >
                  {copiedInteractive ? (
                    <><Check className="h-3 w-3 mr-1" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3 mr-1" /> Copiar Comando</>
                  )}
                </Button>
              </div>
            </div>

            {/* JWT Token para casos sem credenciais locais */}
            <div className="space-y-2">
              <p className="text-xs font-medium">Se o script pedir autorização:</p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.access_token) {
                        toast.error('Você precisa estar logado para copiar o token');
                        return;
                      }
                      await navigator.clipboard.writeText(session.access_token);
                      setCopiedJwt(true);
                      setTimeout(() => setCopiedJwt(false), 3000);
                      toast.success('Token JWT copiado! Cole no PowerShell quando solicitado.');
                    } catch {
                      toast.error('Falha ao copiar token');
                    }
                  }}
                >
                  {copiedJwt ? (
                    <><Check className="h-3 w-3 mr-1" /> Token Copiado!</>
                  ) : (
                    <><Key className="h-3 w-3 mr-1" /> Copiar Token JWT</>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Só se credenciais locais foram perdidas
                </span>
              </div>
            </div>
          </TabsContent>

          {/* === ABA: Em Massa === */}
          <TabsContent value="massa" className="space-y-4 mt-3">
            <Alert className="border-primary/50 bg-primary/10">
              <Key className="h-4 w-4 text-primary" />
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
                <li>Substitua <code className="bg-muted px-1 rounded">COLE_SUA_ENROLLMENT_KEY</code> pela chave copiada</li>
                <li>Distribua o comando via RMM, GPO ou script centralizado</li>
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
