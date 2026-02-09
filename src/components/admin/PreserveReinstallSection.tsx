/**
 * PreserveReinstallSection - Seção de reinstalação preservando credenciais
 * 
 * Fornece comandos prontos para copiar e colar no PowerShell,
 * evitando erros de usuário como colar apenas a URL.
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Copy, 
  Check, 
  Terminal, 
  Shield, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Key
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Comando principal (usa irm - mais limpo)
const PRIMARY_COMMAND = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm ${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script | iex`;

// Comando alternativo (usa Invoke-WebRequest com UseBasicParsing - melhor compatibilidade com proxy)
const FALLBACK_COMMAND = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $script = (Invoke-WebRequest -Uri "${SUPABASE_URL}/functions/v1/get-reinstall-preserve-script" -UseBasicParsing).Content; Invoke-Expression $script`;

// Comando de diagnóstico de rede
const NETWORK_TEST_COMMAND = `Test-NetConnection -ComputerName "${new URL(SUPABASE_URL).hostname}" -Port 443`;

export function PreserveReinstallSection() {
  const [copiedPrimary, setCopiedPrimary] = useState(false);
  const [copiedFallback, setCopiedFallback] = useState(false);
  const [copiedNetworkTest, setCopiedNetworkTest] = useState(false);
  const [copiedJwt, setCopiedJwt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCopy = async (text: string, type: 'primary' | 'fallback' | 'network') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'primary') {
        setCopiedPrimary(true);
        setTimeout(() => setCopiedPrimary(false), 2000);
      } else if (type === 'fallback') {
        setCopiedFallback(true);
        setTimeout(() => setCopiedFallback(false), 2000);
      } else {
        setCopiedNetworkTest(true);
        setTimeout(() => setCopiedNetworkTest(false), 2000);
      }
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
              <Badge variant="secondary" className="ml-2 text-xs">Recomendado</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              Atualiza o agente mantendo nome, token e HMAC originais
            </CardDescription>
          </div>
          <RefreshCw className="h-5 w-5 text-primary opacity-60" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instruções claras */}
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs">
            <strong>Importante:</strong> Cole o comando completo abaixo (não apenas a URL). 
            O PowerShell precisa do comando inteiro para baixar e executar o script.
          </AlertDescription>
        </Alert>

        {/* Passos */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">COMO USAR:</p>
          <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
            <li>Abra o <strong>PowerShell como Administrador</strong></li>
            <li>Clique em "Copiar Comando" abaixo</li>
            <li>Cole no PowerShell (Ctrl+V ou clique direito)</li>
            <li>Pressione Enter e aguarde finalizar</li>
            <li>Se pedir JWT token, clique em <strong>"Copiar Token JWT"</strong> abaixo e cole no PowerShell</li>
            <li>Confirme a versão exibida no final</li>
          </ol>
        </div>

        {/* Comando Principal */}
        <div className="space-y-2">
          <p className="text-xs font-medium">Comando Principal:</p>
          <div className="relative">
            <pre className="bg-muted/50 border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono">
              {PRIMARY_COMMAND}
            </pre>
            <Button
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => handleCopy(PRIMARY_COMMAND, 'primary')}
            >
              {copiedPrimary ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copiar Comando
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Copiar JWT para recuperação de credenciais (Strategy 3 - v2.8.0) */}
        <div className="space-y-2">
          <p className="text-xs font-medium">Token JWT (se o script pedir):</p>
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
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Token Copiado!
                </>
              ) : (
                <>
                  <Key className="h-3 w-3 mr-1" />
                  Copiar Token JWT
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Necessário apenas se credenciais locais foram perdidas
            </span>
          </div>
        </div>

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
            {/* Comando Alternativo */}
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
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Teste de Rede */}
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
                    <>
                      <Check className="h-3 w-3 mr-1" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se TcpTestSucceeded = False, verifique firewall/proxy.
              </p>
            </div>

            {/* Dicas de troubleshooting */}
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
