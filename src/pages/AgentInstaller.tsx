import { useState, useEffect } from "react";
import { Package, Download, Terminal, CheckCircle2, Loader2, Copy, AlertTriangle, Shield, Clock, FileCheck, BookOpen, HelpCircle, Zap, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { CircuitBreaker, CircuitState } from "@/lib/circuit-breaker";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Circuit Breaker for auto-generate-enrollment
const enrollmentCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 60000,
  name: 'auto-generate-enrollment'
});

// Retry with exponential backoff
const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 2000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        toast.info(`Tentativa ${attempt + 1}/${maxRetries} falhou. Tentando novamente em ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

const AgentInstaller = () => {
  // Step 1: Configuration
  const [agentName, setAgentName] = useState("");
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");
  const [agentNameError, setAgentNameError] = useState("");
  const [isCheckingName, setIsCheckingName] = useState(false);
  
  // Step 2: Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastEnrollmentKey, setLastEnrollmentKey] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState("");
  const [previewCredentials, setPreviewCredentials] = useState<{
    agentId?: string;
    expiresAt?: string;
  } | null>(null);
  
  // Step 3: EXE Build states
  const [exeBuildStatus, setExeBuildStatus] = useState<'idle' | 'building' | 'completed' | 'failed'>('idle');
  const [exeBuildId, setExeBuildId] = useState<string | null>(null);
  const [exeDownloadUrl, setExeDownloadUrl] = useState<string | null>(null);
  const [exeSha256, setExeSha256] = useState<string | null>(null);
  const [exeFileSize, setExeFileSize] = useState<number | null>(null);
  const [githubActionsUrl, setGithubActionsUrl] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;
  
  // Circuit breaker monitoring
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);

  // Monitor circuit breaker
  useEffect(() => {
    const interval = setInterval(() => {
      const state = enrollmentCircuitBreaker.getState();
      setCircuitBreakerOpen(state === CircuitState.OPEN);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Solicitar permissão para notificações
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Real-time agent name validation with availability check
  useEffect(() => {
    if (!agentName) {
      setAgentNameError("");
      return;
    }

    const invalidChars = /[^a-zA-Z0-9\-_]/;
    if (invalidChars.test(agentName)) {
      setAgentNameError("❌ Use apenas letras, números, hífens e underscores");
      return;
    }

    if (agentName.length < 3) {
      setAgentNameError("❌ Nome deve ter pelo menos 3 caracteres");
      return;
    }

    if (agentName.length > 50) {
      setAgentNameError("❌ Máximo de 50 caracteres");
      return;
    }

    // Debounce para verificar disponibilidade
    const timer = setTimeout(async () => {
      setIsCheckingName(true);
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data: { user } } = await supabase.auth.getUser();
        
        // Buscar tenant_id do usuário
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('tenant_id')
          .eq('user_id', user?.id)
          .maybeSingle();

        const { data, error } = await supabase.functions.invoke(
          'check-agent-name-availability',
          {
            body: { 
              agentName, 
              tenantId: userRole?.tenant_id 
            },
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
          }
        );

        if (error) throw error;

        if (!data.available) {
          setAgentNameError(`❌ ${data.reason}`);
        } else {
          setAgentNameError('✅ Nome disponível');
        }
      } catch (err) {
        console.error('Erro ao verificar nome:', err);
        setAgentNameError('');
      } finally {
        setIsCheckingName(false);
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(timer);
  }, [agentName]);

  const isNameValid = agentName.length >= 3 && agentName.length <= 50 && !/[^a-zA-Z0-9\-_]/.test(agentName) && !agentNameError.startsWith('❌');

  // Smart timeout para builds
  useEffect(() => {
    if (exeBuildStatus === 'building' && exeBuildId) {
      const timeout = setTimeout(() => {
        toast.error('⚠️ Build Timeout', {
          description: 'Build está demorando mais que o esperado. Verifique os logs do GitHub Actions.',
          duration: 10000,
        });
        setExeBuildStatus('failed');
        setRetryCount(0);
      }, 300000); // 5 minutos
      
      return () => clearTimeout(timeout);
    }
  }, [exeBuildStatus, exeBuildId]);

  // Monitorar conclusão de build e enviar notificação
  useEffect(() => {
    if (exeBuildStatus === 'completed' && exeDownloadUrl) {
      // Notificação browser
      if (Notification.permission === 'granted') {
        const notification = new Notification('🎉 Build EXE Concluído!', {
          body: `${agentName} está pronto para download`,
          icon: '/favicon.ico',
          tag: `build-${exeBuildId}`,
          requireInteraction: true,
        });

        notification.onclick = () => {
          window.focus();
          const element = document.getElementById('exe-download');
          element?.scrollIntoView({ behavior: 'smooth' });
          notification.close();
        };
      }

      // Piscar título da página
      let flash = true;
      const titleInterval = setInterval(() => {
        document.title = flash ? '✅ EXE Pronto! | CyberShield' : 'CyberShield Agent Installer';
        flash = !flash;
      }, 1000);

      // Parar após 10 segundos ou quando usuário focar a página
      const stopFlashing = () => {
        clearInterval(titleInterval);
        document.title = 'CyberShield Agent Installer';
        document.removeEventListener('visibilitychange', stopFlashing);
      };
      
      setTimeout(stopFlashing, 10000);
      document.addEventListener('visibilitychange', stopFlashing);

      // Toast persistente
      toast.success('✅ EXE Pronto para Download!', {
        description: 'Seu instalador está pronto',
        duration: 30000,
      });
    }
  }, [exeBuildStatus, exeDownloadUrl, agentName, exeBuildId]);

  const generateCredentials = async () => {
    if (!isNameValid) {
      toast.error("Nome do agente inválido");
      return null;
    }

    const circuitState = enrollmentCircuitBreaker.getState();
    if (circuitState === CircuitState.OPEN) {
      throw new Error('Backend temporariamente indisponível. Aguarde alguns instantes.');
    }

    const { data: credentials, error: credError } = await retryWithBackoff(
      () => enrollmentCircuitBreaker.execute(() => 
        supabase.functions.invoke('auto-generate-enrollment', {
          body: { agentName: agentName.trim() }
        })
      )
    );

    if (credError) throw credError;
    if (!credentials) throw new Error("Nenhuma credencial retornada");

    setPreviewCredentials({
      agentId: credentials.agentId,
      expiresAt: credentials.expiresAt
    });
    setLastEnrollmentKey(credentials.enrollmentKey);

    return credentials;
  };

  const generateCopyPasteCommand = async () => {
    setIsGenerating(true);
    
    try {
      toast.info("Gerando comando one-click...");
      const credentials = await generateCredentials();
      if (!credentials) return;

      const installUrl = `${SUPABASE_URL}/functions/v1/serve-installer/${credentials.enrollmentKey}`;
      const command = platform === 'windows'
        ? `irm ${installUrl} | iex`
        : `curl -sL ${installUrl} | sudo bash`;

      setInstallCommand(command);

      await supabase.functions.invoke('track-installation-event', {
        body: {
          agent_name: agentName.trim(),
          event_type: 'generated',
          platform: platform,
          installation_method: 'one_click'
        }
      }).catch(err => logger.error('Failed to track event', err));

      toast.success("✅ Comando gerado!", {
        description: "Copie e execute no servidor"
      });

    } catch (error: any) {
      logger.error('Generate command error', error);
      const errorMessage = error?.message || "Erro desconhecido";
      const requestId = error?.context?.requestId;
      
      let description = errorMessage;
      if (requestId) description += ` (ID: ${requestId})`;
      
      toast.error("Erro ao gerar comando", { description, duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateInstaller = async () => {
    setIsGenerating(true);
    
    try {
      toast.info("Gerando instalador para download...");
      const credentials = await generateCredentials();
      if (!credentials) return;

      const templatePath = platform === 'windows' 
        ? '/templates/install-windows-template.ps1'
        : '/templates/install-linux-template.sh';
      
      const agentScriptPath = platform === 'windows'
        ? '/agent-scripts/cybershield-agent-windows.ps1'
        : '/agent-scripts/cybershield-agent-linux.sh';

      const [templateResponse, agentScriptResponse] = await Promise.all([
        fetch(templatePath),
        fetch(agentScriptPath)
      ]);

      if (!templateResponse.ok || !agentScriptResponse.ok) {
        throw new Error('Falha ao baixar templates');
      }

      let templateContent = await templateResponse.text();
      const agentScriptContent = await agentScriptResponse.text();

      templateContent = templateContent
        .replace(/\{\{AGENT_TOKEN\}\}/g, credentials.agentToken)
        .replace(/\{\{HMAC_SECRET\}\}/g, credentials.hmacSecret)
        .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
        .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
        .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

      const fileName = platform === 'windows'
        ? `install-${agentName}-windows.ps1`
        : `install-${agentName}-linux.sh`;

      const blob = new Blob([templateContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await supabase.functions.invoke('track-installation-event', {
        body: {
          agent_name: agentName.trim(),
          event_type: 'downloaded',
          platform: platform,
          installation_method: 'download'
        }
      }).catch(err => logger.error('Failed to track event', err));

      toast.success(`✅ Instalador baixado: ${fileName}`);

    } catch (error: any) {
      logger.error('Generate installer error', error);
      const errorMessage = error?.message || "Erro desconhecido";
      const requestId = error?.context?.requestId;
      
      let description = errorMessage;
      if (requestId) description += ` (ID: ${requestId})`;
      
      toast.error("Erro ao gerar instalador", { description, duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBuildExe = async () => {
    if (!isNameValid || !lastEnrollmentKey) {
      toast.error('Gere credenciais primeiro (clique em "Gerar Comando" ou "Baixar Script")');
      return;
    }

    setExeBuildStatus('building');
    setExeBuildId(null);
    setExeDownloadUrl(null);
    setExeSha256(null);
    setExeFileSize(null);
    setGithubActionsUrl(null);
    setPollAttempts(0);
    
    toast.info('🚀 Iniciando build do EXE... Aguarde 2-3 minutos');

    try {
      const { data, error } = await supabase.functions.invoke('build-agent-exe', {
        body: {
          agent_name: agentName.trim(),
          enrollment_key: lastEnrollmentKey
        }
      });

      if (error) throw error;

      const { build_id, github_actions_url } = data;
      setExeBuildId(build_id);
      setGithubActionsUrl(github_actions_url || null);

      logger.info('Build initiated', { build_id, agent_name: agentName.trim(), github_actions_url });

      // Poll for build status with retry logic
      let attempts = 0;
      const maxAttempts = 60; // 5 min timeout
      
      const pollInterval = setInterval(async () => {
        attempts++;
        setPollAttempts(attempts);
        
        if (attempts > maxAttempts) {
          clearInterval(pollInterval);
          
          // Retry automático
          if (retryCount < MAX_RETRIES) {
            toast.warning('⚠️ Build timeout', {
              description: `Tentando novamente (${retryCount + 1}/${MAX_RETRIES}) em 30s...`,
              duration: 5000,
            });
            
            setTimeout(async () => {
              setRetryCount(prev => prev + 1);
              setPollAttempts(0);
              await handleBuildExe();
            }, 30000);
          } else {
            setExeBuildStatus('failed');
            toast.error('Timeout: Build demorou mais de 5 minutos após múltiplas tentativas');
            setRetryCount(0);
          }
          return;
        }

        try {
          const { data: buildData, error: pollError } = await supabase
            .from('agent_builds')
            .select('build_status, download_url, sha256_hash, file_size_bytes, error_message, build_duration_seconds, github_run_url')
            .eq('id', build_id)
            .single();

          if (pollError) {
            logger.error('Polling error', pollError);
            return;
          }

          if (buildData.github_run_url && !githubActionsUrl) {
            setGithubActionsUrl(buildData.github_run_url);
          }

          logger.info('Poll attempt', { attempt: attempts, status: buildData.build_status });

          if (buildData.build_status === 'completed') {
            clearInterval(pollInterval);
            setExeBuildStatus('completed');
            setExeDownloadUrl(buildData.download_url);
            setExeSha256(buildData.sha256_hash);
            setExeFileSize(buildData.file_size_bytes);
            setRetryCount(0);
            
            const duration = buildData.build_duration_seconds || 0;
            toast.success(`✅ EXE gerado em ${duration}s!`, {
              description: 'Clique em Download para baixar'
            });
          } else if (buildData.build_status === 'failed') {
            clearInterval(pollInterval);
            
            // Retry automático
            if (retryCount < MAX_RETRIES) {
              toast.warning('⚠️ Build falhou', {
                description: `Tentando novamente (${retryCount + 1}/${MAX_RETRIES}) em 30s...`,
                duration: 5000,
              });
              
              setTimeout(async () => {
                setRetryCount(prev => prev + 1);
                setPollAttempts(0);
                await handleBuildExe();
              }, 30000);
            } else {
              setExeBuildStatus('failed');
              toast.error(`Falha: ${buildData.error_message || 'Erro desconhecido'} após múltiplas tentativas`);
              setRetryCount(0);
            }
          }
        } catch (pollErr) {
          logger.error('Poll exception', pollErr);
        }
      }, 5000);

    } catch (error: any) {
      logger.error('Build EXE failed', error);
      setExeBuildStatus('failed');
      toast.error(`Erro ao gerar EXE: ${error?.message || 'Erro desconhecido'}`);
    }
  };

  const refreshBuildStatus = async () => {
    if (!exeBuildId) return;
    try {
      const { data: buildData, error } = await supabase
        .from('agent_builds')
        .select('build_status, download_url, sha256_hash, file_size_bytes, error_message, build_duration_seconds, github_run_url')
        .eq('id', exeBuildId)
        .single();

      if (error) {
        logger.error('Manual refresh error', error);
        toast.error('Erro ao atualizar status');
        return;
      }

      if (buildData.github_run_url) setGithubActionsUrl(buildData.github_run_url);

      if (buildData.build_status === 'completed') {
        setExeBuildStatus('completed');
        setExeDownloadUrl(buildData.download_url);
        setExeSha256(buildData.sha256_hash);
        setExeFileSize(buildData.file_size_bytes);
        toast.success(`✅ EXE pronto!`);
      } else if (buildData.build_status === 'failed') {
        setExeBuildStatus('failed');
        toast.error(`Falha: ${buildData.error_message}`);
      } else {
        toast.info('Build ainda em execução...');
      }
    } catch (e) {
      logger.error('Refresh exception', e);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand);
    
    await supabase.functions.invoke('track-installation-event', {
      body: {
        agent_name: agentName.trim(),
        event_type: 'command_copied',
        platform: platform,
        installation_method: 'one_click'
      }
    }).catch(err => logger.error('Failed to track copy', err));
    
    toast.success("✅ Comando copiado!");
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Package className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Gerador de Instaladores CyberShield</h1>
          <p className="text-muted-foreground">
            Instalação simplificada em 3 passos - sem configuração manual
          </p>
        </div>
      </div>

      {/* Circuit Breaker Warning */}
      {circuitBreakerOpen && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Backend Temporariamente Indisponível</AlertTitle>
          <AlertDescription>
            O sistema está em modo de proteção devido a múltiplas falhas. Aguarde alguns instantes e tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {/* STEP 1: Configure Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full w-8 h-8 flex items-center justify-center">1</Badge>
            Configurar Agente
          </CardTitle>
          <CardDescription>
            Defina um nome único e escolha a plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agentName">Nome do Agente</Label>
            <div className="relative">
              <Input
                id="agentName"
                placeholder="ex: servidor-web-01"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                disabled={isGenerating || exeBuildStatus === 'building'}
                className={agentNameError && agentNameError.startsWith('❌') ? 'border-red-500' : ''}
              />
              {isCheckingName && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {agentNameError && (
              <p className={`text-sm mt-1 ${
                agentNameError.startsWith('✅') ? 'text-green-600' : 'text-red-600'
              }`}>
                {agentNameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Plataforma</Label>
            <RadioGroup value={platform} onValueChange={(v: any) => setPlatform(v)} disabled={isGenerating || exeBuildStatus === 'building'}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="windows" id="windows" />
                <Label htmlFor="windows" className="cursor-pointer">Windows (PowerShell)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="linux" id="linux" />
                <Label htmlFor="linux" className="cursor-pointer">Linux (Bash)</Label>
              </div>
            </RadioGroup>
          </div>

          {previewCredentials && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Credenciais Geradas</AlertTitle>
              <AlertDescription className="space-y-1 text-xs">
                <div>Agent ID: <code className="bg-muted px-1 rounded">{previewCredentials.agentId?.slice(0, 16)}...</code></div>
                <div>Expira em: <code className="bg-muted px-1 rounded">{new Date(previewCredentials.expiresAt!).toLocaleString()}</code></div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* STEP 2: Choose Installation Method */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full w-8 h-8 flex items-center justify-center">2</Badge>
            Escolher Método de Instalação
          </CardTitle>
          <CardDescription>
            Selecione como deseja instalar o agente no servidor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="one-click" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="one-click">
                <Zap className="h-4 w-4 mr-2" />
                Comando One-Click
              </TabsTrigger>
              <TabsTrigger value="download">
                <Download className="h-4 w-4 mr-2" />
                Baixar Script
              </TabsTrigger>
              <TabsTrigger value="exe-build">
                <FileCheck className="h-4 w-4 mr-2" />
                Build EXE
              </TabsTrigger>
            </TabsList>

            <TabsContent value="one-click" className="space-y-4 mt-4">
              <Alert>
                <Terminal className="h-4 w-4" />
                <AlertTitle>Instalação Instantânea</AlertTitle>
                <AlertDescription>
                  Gere um comando temporário que instala o agente automaticamente. Válido por 24h.
                </AlertDescription>
              </Alert>

              <Button 
                onClick={generateCopyPasteCommand} 
                disabled={!isNameValid || isGenerating || circuitBreakerOpen}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Terminal className="h-4 w-4 mr-2" />
                    Gerar Comando
                  </>
                )}
              </Button>

              {installCommand && (
                <div className="space-y-2">
                  <Label>Comando de Instalação</Label>
                  <div className="flex gap-2">
                    <Input value={installCommand} readOnly className="font-mono text-xs" />
                    <Button onClick={copyToClipboard} variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cole este comando no terminal do servidor como administrador
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="download" className="space-y-4 mt-4">
              <Alert>
                <Download className="h-4 w-4" />
                <AlertTitle>Download Manual</AlertTitle>
                <AlertDescription>
                  Baixe o script de instalação completo para executar manualmente no servidor.
                </AlertDescription>
              </Alert>

              <Button 
                onClick={generateInstaller} 
                disabled={!isNameValid || isGenerating || circuitBreakerOpen}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Script {platform === 'windows' ? '.ps1' : '.sh'}
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="exe-build" className="space-y-4 mt-4">
              <Alert>
                <FileCheck className="h-4 w-4" />
                <AlertTitle>Build Automático de EXE</AlertTitle>
                <AlertDescription>
                  Gera um instalador Windows .exe através do GitHub Actions. Processo leva 2-3 minutos.
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleBuildExe} 
                disabled={!isNameValid || !lastEnrollmentKey || exeBuildStatus === 'building' || circuitBreakerOpen}
                className="w-full"
              >
                {exeBuildStatus === 'building' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Buildando... ({pollAttempts}/60)
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Build EXE no GitHub Actions
                  </>
                )}
              </Button>

              {!lastEnrollmentKey && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Gere as credenciais primeiro usando "Gerar Comando" ou "Baixar Script"
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* STEP 3: Track Build Status */}
      {exeBuildStatus !== 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full w-8 h-8 flex items-center justify-center">3</Badge>
              Status do Build
            </CardTitle>
            <CardDescription>
              Acompanhe o progresso da geração do executável
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {exeBuildStatus === 'building' && (
              <div className="space-y-3">
                <Progress value={(pollAttempts / 60) * 100} className="h-2" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Tentativa {pollAttempts}/60 (timeout em {Math.max(0, 5 - Math.floor(pollAttempts / 12))} min)
                    {retryCount > 0 && ` • Retry ${retryCount}/${MAX_RETRIES}`}
                  </span>
                  <Button onClick={refreshBuildStatus} variant="ghost" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                  </Button>
                </div>

                {githubActionsUrl && (
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertTitle>Build em Progresso</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>O instalador está sendo compilado no GitHub Actions.</p>
                      <Button onClick={() => window.open(githubActionsUrl, '_blank')} variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver Logs no GitHub Actions
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {pollAttempts > 20 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Build Demorando Mais Que o Esperado</AlertTitle>
                    <AlertDescription>
                      O build geralmente leva 2-3 minutos. Verifique os logs do GitHub Actions para detalhes.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {exeBuildStatus === 'completed' && (
              <Alert id="exe-download" className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">✅ Build Concluído!</AlertTitle>
                <AlertDescription className="space-y-3">
                  <div className="space-y-1 text-sm text-green-700 dark:text-green-300">
                    <div>SHA256: <code className="bg-green-100 dark:bg-green-900 px-1 rounded text-xs">{exeSha256?.slice(0, 16)}...</code></div>
                    <div>Tamanho: <code className="bg-green-100 dark:bg-green-900 px-1 rounded text-xs">{(exeFileSize! / 1024 / 1024).toFixed(2)} MB</code></div>
                  </div>
                  <Button onClick={() => window.open(exeDownloadUrl!, '_blank')} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Instalador EXE
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {exeBuildStatus === 'failed' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Build Falhou</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    {retryCount > 0 
                      ? `Falhou após ${retryCount} tentativa(s) automática(s)` 
                      : 'Ocorreu um erro durante a compilação do executável.'
                    }
                  </p>
                  {githubActionsUrl && (
                    <Button onClick={() => window.open(githubActionsUrl, '_blank')} variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver Logs de Erro
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setRetryCount(0);
                      setPollAttempts(0);
                      handleBuildExe();
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Tentar Novamente
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tutorial Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Tutorial Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="tutorial">
              <AccordionTrigger>Como instalar o agente?</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Badge className="rounded-full">1</Badge>
                    <div>
                      <p className="font-medium">Configure o nome e plataforma</p>
                      <p className="text-sm text-muted-foreground">Escolha um nome único (ex: servidor-web-01)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge className="rounded-full">2</Badge>
                    <div>
                      <p className="font-medium">Escolha o método de instalação</p>
                      <p className="text-sm text-muted-foreground">One-Click é o mais rápido, EXE é o mais portável</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge className="rounded-full">3</Badge>
                    <div>
                      <p className="font-medium">Execute no servidor</p>
                      <p className="text-sm text-muted-foreground">Abra PowerShell/Bash como Admin e cole o comando</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge className="rounded-full">4</Badge>
                    <div>
                      <p className="font-medium">Aguarde a confirmação</p>
                      <p className="text-sm text-muted-foreground">O agente aparecerá na lista de agentes em até 1 minuto</p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-methods">
              <AccordionTrigger>Qual método de instalação escolher?</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div>
                  <p className="font-medium">Comando One-Click</p>
                  <p className="text-sm text-muted-foreground">✅ Mais rápido | ⚠️ Requer internet no servidor</p>
                </div>
                <div>
                  <p className="font-medium">Baixar Script</p>
                  <p className="text-sm text-muted-foreground">✅ Funciona offline | ⚠️ Requer copiar arquivo manualmente</p>
                </div>
                <div>
                  <p className="font-medium">Build EXE</p>
                  <p className="text-sm text-muted-foreground">✅ Executável portável | ⚠️ Leva 2-3 minutos para gerar</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-security">
              <AccordionTrigger>É seguro?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Sim! O instalador valida o SHA256 do script antes de executar, protegendo contra ataques MITM.
                  As credenciais expiram em 24h e são únicas para cada agente.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;