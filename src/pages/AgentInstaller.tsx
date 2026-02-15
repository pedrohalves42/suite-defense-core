import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Package, Download, Terminal, CheckCircle2, Loader2, Copy, AlertTriangle, Shield, Clock, FileCheck, BookOpen, HelpCircle, Zap, ExternalLink, RefreshCw, Upload } from "lucide-react";
import { BuildProgressIndicator } from "@/components/BuildProgressIndicator";
import { ManualInstallationCard } from "@/components/ManualInstallationCard";
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
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useRetryFetch } from "@/hooks/useRetryFetch";
import { useBuildRealtime, BuildStatus } from "@/hooks/useBuildRealtime";
import { storage } from "@/lib/storage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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

/**
 * Valida a integridade do instalador comparando SHA256
 */
const validateInstallerIntegrity = async (
  blob: Blob, 
  expectedSha256: string
): Promise<boolean> => {
  try {
    logger.info('[SHA256] Iniciando validacao de integridade', {
      expectedSha256,
      blobSize: blob.size
    });
    
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    logger.info('[SHA256] Hash calculado', {
      calculated: hashHex,
      expected: expectedSha256,
      match: hashHex === expectedSha256
    });
    
    if (hashHex !== expectedSha256) {
      logger.error('[SHA256] MISMATCH DETECTADO!', {
        calculated: hashHex,
        expected: expectedSha256
      });
      
      toast.error(
        '? ERRO DE SEGURANCA: Hash SHA256 nao corresponde! O instalador pode estar corrompido.',
        { duration: 8000 }
      );
      
      return false;
    }
    
    toast.success('[OK]  Integridade do instalador validada com sucesso!');
    return true;
  } catch (error) {
    logger.error('[SHA256] Erro ao validar hash', error);
    toast.error(`Erro ao validar SHA256: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    return false;
  }
};

const AgentInstaller = () => {
  // Tutorial expanded on first visit
  const [tutorialDefaultOpen] = useState(() => {
    const seen = localStorage.getItem('installer-tutorial-seen');
    if (!seen) {
      localStorage.setItem('installer-tutorial-seen', 'true');
      return 'tutorial';
    }
    return undefined;
  });

  // Connectivity & Retry hooks
  const { isOnline } = useOnlineStatus();
  const { retryFetch, isRetrying } = useRetryFetch();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Step 1: Configuration
  const [agentName, setAgentName] = useState("");
  const [platform, setPlatform] = useState<"windows" | "linux" | "macos">("windows");
  const [agentNameError, setAgentNameError] = useState("");
  const [isCheckingName, setIsCheckingName] = useState(false);

  // Detectar se veio de regeneracao de credenciais
  useEffect(() => {
    const agentNameFromUrl = searchParams.get("agent_name");
    const isRegenerated = searchParams.get("regenerated") === "true";

    if (agentNameFromUrl) {
      setAgentName(agentNameFromUrl);
    }

    if (agentNameFromUrl && isRegenerated) {
      toast.info(
        `? Agente "${agentNameFromUrl}" teve credenciais regeneradas. O instalador antigo NAO funciona mais. Gere um novo abaixo.`,
        { duration: 8000 }
      );
    }
  }, [searchParams]);
  
  // FASE 1.1: Health check do GitHub
  const [githubHealthy, setGithubHealthy] = useState<boolean | null>(null);
  
  // FASE 2.2 & 5: Estados de progresso detalhado consolidado
  type BuildProgressStep = 'preparing' | 'dispatching' | 'compiling' | 'uploading' | 'completed';
  
  interface BuildProgressState {
    currentStep: BuildProgressStep;
    status: 'pending' | 'active' | 'completed' | 'error';
    message: string;
    githubRunUrl?: string;
  }
  
  const [buildProgress, setBuildProgress] = useState<BuildProgressState>({
    currentStep: 'preparing',
    status: 'pending',
    message: 'Aguardando inicio...'
  });
  
  // Step 2: Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastEnrollmentKey, setLastEnrollmentKey] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState("");
  const [previewCredentials, setPreviewCredentials] = useState<{
    agentId?: string;
    expiresAt?: string;
  } | null>(null);
  
  // Step 3: EXE Build states
  const [exeBuildStatus, setExeBuildStatus] = useState<'idle' | 'building' | 'completed' | 'failed' | 'cached'>('idle');
  const [exeBuildId, setExeBuildId] = useState<string | null>(null);
  const [exeDownloadUrl, setExeDownloadUrl] = useState<string | null>(null);
  const [exeSha256, setExeSha256] = useState<string | null>(null);
  const [exeFileSize, setExeFileSize] = useState<number | null>(null);
  const [githubActionsUrl, setGithubActionsUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  // FASE 2: Realtime hook para monitorar build
  const handleBuildStatusChange = useCallback((status: BuildStatus) => {
    logger.info('[Realtime] Build status changed', status);

    if (status.github_run_url && !githubActionsUrl) {
      setGithubActionsUrl(status.github_run_url);
    }

    if (status.build_status === 'completed') {
      setExeBuildStatus('completed');
      setExeDownloadUrl(status.download_url);
      setExeSha256(status.sha256_hash);
      setExeFileSize(status.file_size_bytes);
      setRetryCount(0);
      storage.remove('current-build');
      
      setBuildProgress({
        currentStep: 'completed',
        status: 'completed',
        message: 'Build concluído com sucesso!',
        githubRunUrl: status.github_run_url || undefined
      });
      
      const duration = status.build_duration_seconds || 0;
      toast.success(`✅ EXE gerado em ${duration}s!`, {
        description: 'Clique em Download para baixar'
      });
    } else if (status.build_status === 'failed') {
      storage.remove('current-build');
      
      if (retryCount < MAX_RETRIES) {
        toast.warning('⚠️ Build falhou', {
          description: `Tentando novamente (${retryCount + 1}/${MAX_RETRIES}) em 30s...`,
          duration: 5000,
        });
        
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          handleBuildExe();
        }, 30000);
      } else {
        setExeBuildStatus('failed');
        toast.error(`Falha: ${status.error_message || 'Erro desconhecido'} após múltiplas tentativas`);
        setRetryCount(0);
      }
    }
  }, [githubActionsUrl, retryCount]);

  const { fetchStatus: fetchBuildStatus, cleanup: cleanupRealtime } = useBuildRealtime({
    buildId: exeBuildId,
    onStatusChange: handleBuildStatusChange,
    onError: (error) => {
      logger.warn('[Realtime] Subscription error, will fallback to polling', error);
      // Fallback para polling se Realtime falhar
      startPollingFallback();
    }
  });

  // Fallback polling (apenas se Realtime falhar)
  const startPollingFallback = useCallback(() => {
    if (!exeBuildId || exeBuildStatus !== 'building') return;
    
    logger.info('[Polling Fallback] Starting fallback polling');
    const pollInterval = setInterval(async () => {
      const status = await fetchBuildStatus();
      if (status) {
        handleBuildStatusChange(status);
        if (status.build_status === 'completed' || status.build_status === 'failed') {
          clearInterval(pollInterval);
        }
      }
    }, 10000); // Poll a cada 10s como fallback
    
    // Limpar após 5 minutos
    setTimeout(() => clearInterval(pollInterval), 300000);
  }, [exeBuildId, exeBuildStatus, fetchBuildStatus, handleBuildStatusChange]);
  
  // FASE 4: PS1 SHA256 validation states
  const [ps1Sha256, setPs1Sha256] = useState<string | null>(null);
  const [ps1SizeBytes, setPs1SizeBytes] = useState<number | null>(null);
  const [isValidatingPs1, setIsValidatingPs1] = useState(false);
  
  // FASE 3: Circuit Breaker - Ajustado conforme plano definitivo
  const [enrollmentCircuitBreaker] = useState(() => new CircuitBreaker({
    failureThreshold: 10,       // [OK]  FASE 3: Aumentado de 5 para 10 (mais tolerante)
    successThreshold: 3,        // [OK]  FASE 3: Aumentado de 2 para 3 (mais estavel)
    timeout: 60000,             // [OK]  FASE 3: Aumentado para 60s (eliminar timeouts prematuros)
    name: 'auto-generate-enrollment'
  }));
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);

  // FASE 2.2: Monitor circuit breaker with logging
  useEffect(() => {
    const interval = setInterval(() => {
      const state = enrollmentCircuitBreaker.getState();
      const wasOpen = circuitBreakerOpen;
      const isNowOpen = state === CircuitState.OPEN;
      
      setCircuitBreakerOpen(isNowOpen);
      
      // Log state changes
      if (!wasOpen && isNowOpen) {
        logger.warn('Circuit breaker ABERTO - backend temporariamente indisponivel', {
          circuitName: 'auto-generate-enrollment'
        });
      } else if (wasOpen && !isNowOpen) {
        logger.info('Circuit breaker FECHADO - backend disponivel novamente', {
          circuitName: 'auto-generate-enrollment'
        });
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [circuitBreakerOpen, enrollmentCircuitBreaker]);

  // FASE 1.1: Health Check do GitHub ao carregar
  useEffect(() => {
    const checkGithubHealth = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('build-agent-exe', {
          method: 'GET'
        });
        
        if (error) throw error;
        
        const healthy = data?.checks?.github_token && data?.checks?.github_repo;
        setGithubHealthy(healthy);
        
        if (!healthy) {
          logger.warn('[Health Check] GitHub nao configurado corretamente', data);
        } else {
          logger.info('[Health Check] GitHub configurado e pronto');
        }
      } catch (error) {
        logger.error('[Health Check] Erro ao verificar GitHub', error);
        setGithubHealthy(false);
      }
    };
    
    checkGithubHealth();
  }, []);

  // Solicitar permissao para notificacoes
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // FASE 1: Recuperar build em progresso do localStorage
  useEffect(() => {
    const savedBuild = storage.get<{ build_id: string; agent_name: string; started_at: number }>('current-build');
    
    if (savedBuild && Date.now() - savedBuild.started_at < 15 * 60 * 1000) {
      logger.info('[Recovery] Build em progresso detectado', savedBuild);
      toast.info('Recuperando build em progresso...', {
        description: `Agente: ${savedBuild.agent_name}`
      });
      
      setExeBuildId(savedBuild.build_id);
      setAgentName(savedBuild.agent_name);
      setExeBuildStatus('building');
      
      // Continuar polling
      // A logica de polling sera acionada automaticamente quando exeBuildId for definido
    }
  }, []);

  // FASE 2.1: Real-time agent name validation with AbortController and race condition prevention
  useEffect(() => {
    if (!agentName) {
      setAgentNameError("");
      return;
    }

    const invalidChars = /[^a-zA-Z0-9\-_]/;
    if (invalidChars.test(agentName)) {
      setAgentNameError("[ERROR]  Use apenas letras, numeros, hifens e underscores");
      return;
    }

    if (agentName.length < 3) {
      setAgentNameError("[ERROR]  Nome deve ter pelo menos 3 caracteres");
      return;
    }

    if (agentName.length > 50) {
      setAgentNameError("[ERROR]  Maximo de 50 caracteres");
      return;
    }

    // FASE 2.1: AbortController to prevent race conditions
    const abortController = new AbortController();
    let isMounted = true;

    // Debounce para verificar disponibilidade
    const timer = setTimeout(async () => {
      if (!isMounted) return;
      
      setIsCheckingName(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const checkNameWithRetry = async (retries = 2): Promise<void> => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            logger.warn('No active session during agent name validation');
            if (isMounted) {
              setAgentNameError('[ERROR]  Sessao expirada. Faca login novamente.');
              setIsCheckingName(false);
            }
            return;
          }

          if (abortController.signal.aborted || !isMounted) return;

          const { data, error } = await supabase.functions.invoke(
            'check-agent-name-availability',
            {
              body: { agentName },
              headers: {
                Authorization: `Bearer ${session?.access_token}`,
              },
              signal: controller.signal
            }
          );

          clearTimeout(timeoutId);

          if (abortController.signal.aborted || !isMounted) return;

          if (error) throw error;

          if (isMounted) {
            if (!data.available) {
              setAgentNameError(`[ERROR]  ${data.reason || 'Nome indisponivel'}`);
            } else {
              setAgentNameError('[OK]  Nome disponivel');
            }
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            logger.warn('Agent name check timeout');
            if (isMounted) {
              setAgentNameError('?? Timeout - tente novamente');
            }
          } else if (retries > 0) {
            logger.info('Retrying agent name check', { retriesLeft: retries });
            await new Promise(r => setTimeout(r, 1000 * (3 - retries))); // exponential backoff
            return checkNameWithRetry(retries - 1);
          } else {
            if (abortController.signal.aborted || !isMounted) return;
            logger.error('Agent name validation error', { error: err, agentName });
            if (isMounted) {
              setAgentNameError('[ERROR]  Erro ao validar - verifique sua conexao');
            }
          }
        } finally {
          if (isMounted) {
            setIsCheckingName(false);
          }
        }
      };

      await checkNameWithRetry();
    }, 800); // 800ms debounce

    // FASE 2.1: Cleanup to prevent memory leaks and race conditions
    return () => {
      isMounted = false;
      abortController.abort();
      clearTimeout(timer);
    };
  }, [agentName]);

  const isNameValid = agentName.length >= 3 && agentName.length <= 50 && !/[^a-zA-Z0-9\-_]/.test(agentName) && !agentNameError.startsWith('[ERROR] ');

  // Smart timeout para builds
  useEffect(() => {
    if (exeBuildStatus === 'building' && exeBuildId) {
      const timeout = setTimeout(() => {
        toast.error('[WARN] ? Build Timeout', {
          description: 'Build esta demorando mais que o esperado. Verifique os logs do GitHub Actions.',
          duration: 10000,
        });
        setExeBuildStatus('failed');
        setRetryCount(0);
      }, 300000); // 5 minutos
      
      return () => clearTimeout(timeout);
    }
  }, [exeBuildStatus, exeBuildId]);

  // Monitorar conclusao de build e enviar notificacao
  useEffect(() => {
    if (exeBuildStatus === 'completed' && exeDownloadUrl) {
      // Notificacao browser
      if (Notification.permission === 'granted') {
        const notification = new Notification('? Build EXE Concluido!', {
          body: `${agentName} esta pronto para download`,
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

      // Piscar titulo da pagina
      let flash = true;
      const titleInterval = setInterval(() => {
        document.title = flash ? '[OK]  EXE Pronto! | CyberShield' : 'CyberShield Agent Installer';
        flash = !flash;
      }, 1000);

      // Parar apos 10 segundos ou quando usuario focar a pagina
      const stopFlashing = () => {
        clearInterval(titleInterval);
        document.title = 'CyberShield Agent Installer';
        document.removeEventListener('visibilitychange', stopFlashing);
      };
      
      setTimeout(stopFlashing, 10000);
      document.addEventListener('visibilitychange', stopFlashing);

      // Toast persistente
      toast.success('[OK]  EXE Pronto para Download!', {
        description: 'Seu instalador esta pronto',
        duration: 30000,
      });
    }
  }, [exeBuildStatus, exeDownloadUrl, agentName, exeBuildId]);

  // Funcao para baixar e verificar integridade SHA256 do EXE
  const downloadAndVerifyExe = async () => {
    if (!exeDownloadUrl || !exeSha256) {
      toast.error("Informacoes de download incompletas");
      return;
    }

    try {
      toast.info("? Baixando e verificando integridade...", { duration: Infinity });

      // Download do arquivo
      const response = await fetch(exeDownloadUrl);
      if (!response.ok) throw new Error("Falha ao baixar arquivo");

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Calcular SHA256 do arquivo baixado
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Comparar hashes
      if (calculatedHash.toLowerCase() !== exeSha256.toLowerCase()) {
        toast.dismiss();
        toast.error("[ERROR]  FALHA DE SEGURANCA: Hash SHA256 nao corresponde!", {
          description: `Esperado: ${exeSha256.slice(0, 16)}...\nRecebido: ${calculatedHash.slice(0, 16)}...`,
          duration: Infinity,
        });

        // Log de seguranca
        logger.error('SHA256 mismatch detected', {
          expected: exeSha256,
          calculated: calculatedHash,
          buildId: exeBuildId,
          agentName
        });

        // Enviar alerta de seguranca
        await supabase.functions.invoke('send-security-alert', {
          body: {
            alertType: 'integrity_failure',
            severity: 'critical',
            details: {
              expected_hash: exeSha256,
              calculated_hash: calculatedHash,
              build_id: exeBuildId,
              agent_name: agentName,
              download_url: exeDownloadUrl
            }
          }
        }).catch(err => logger.error('Failed to send security alert', err));

        return;
      }

      // Hash valido - prosseguir com download
      toast.dismiss();
      toast.success("[OK]  Integridade verificada! Iniciando download...");

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cybershield-agent-${agentName}.exe`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("? Download concluido com seguranca!");

    } catch (error: any) {
      toast.dismiss();
      toast.error("Erro ao verificar integridade", {
        description: error.message,
        duration: 6000
      });
      logger.error('Download verification error', error);
    }
  };

  const generateCredentials = async () => {
    if (!isNameValid) {
      toast.error("Nome do agente invalido");
      return null;
    }

    const circuitState = enrollmentCircuitBreaker.getState();
    if (circuitState === CircuitState.OPEN) {
      throw new Error('Backend temporariamente indisponivel. Aguarde alguns instantes.');
    }

    const { data: credentials, error: credError } = await retryWithBackoff(
      () => enrollmentCircuitBreaker.execute(() => 
        supabase.functions.invoke('auto-generate-enrollment', {
          body: { agentName: agentName.trim(), platform }
        })
      )
    );

    if (credError) throw credError;
    if (!credentials) throw new Error("Nenhuma credencial retornada");

    // FASE 2.2: Reset circuit breaker apos sucesso
    logger.info('Credenciais geradas com sucesso - resetting circuit breaker', {
      agentName: agentName.trim(),
      circuitState: enrollmentCircuitBreaker.getState()
    });

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

      // Validate HMAC signature before proceeding
      if (credentials.hmacSecret) {
        try {
          const { data: validationResult, error: validationError } = await supabase.functions.invoke(
            'validate-hmac-signature', 
            {
              body: { 
                hmac_secret: credentials.hmacSecret,
                test_payload: 'installation_test'
              }
            }
          );

          if (validationError || !validationResult?.valid) {
            console.error('[HMAC Validation] Failed:', { validationResult, validationError });
            toast.warning(
              "[WARN] ? Aviso de seguranca", 
              { 
                description: "A assinatura HMAC pode estar incorreta. Contate o suporte se a instalacao falhar.",
                duration: 10000 
              }
            );
          } else {
            console.log('[HMAC Validation] [OK]  Passed:', validationResult);
            toast.success("[OK]  Validacao de seguranca OK", { duration: 3000 });
          }
        } catch (validationException) {
          console.error('[HMAC Validation] Exception:', validationException);
          // Nao bloqueia em caso de erro de rede
        }
      }

      const installUrl = `${SUPABASE_URL}/functions/v1/serve-installer/${credentials.enrollmentKey}`;
      const command = platform === 'windows'
        ? `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm ${installUrl} | iex`
        : `curl -sL ${installUrl} | sudo bash`;

      setInstallCommand(command);

      // Track telemetry (non-critical)
      supabase.functions.invoke('track-installation-event', {
        body: {
          agent_name: agentName.trim(),
          event_type: 'generated',
          platform: platform,
          installation_method: 'one_click'
        }
      }).then(({ data, error }) => {
        if (error || (data && !data.ok)) {
          logger.warn('[telemetry] Failed to track generated event', { error, data });
        }
      }).catch(err => logger.warn('[telemetry] Exception tracking event', err));

      toast.success("[OK]  Comando gerado!", {
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

  // FASE 4: Download and validate PS1/SH SHA256
  const downloadAndVerifyScript = async (enrollmentKey: string, platform: 'windows' | 'linux' | 'macos') => {
    if (!enrollmentKey) {
      toast.error("Enrollment key nao disponivel");
      return;
    }

    setIsValidatingPs1(true);

    try {
      const scriptType = platform === 'windows' ? '.PS1' : '.SH';
      toast.info(`? Baixando script ${scriptType} e verificando integridade...`, { duration: Infinity });

      const installUrl = `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`;
      const response = await fetch(installUrl);
      
      if (!response.ok) {
        throw new Error(`Falha ao baixar script: ${response.status}`);
      }

      const scriptContent = await response.text();
      const scriptBlob = new Blob([scriptContent], { type: 'text/plain' });

      // Extract hash from HTTP header
      const serverHash = response.headers.get('X-Script-SHA256');
      const serverSize = parseInt(response.headers.get('X-Script-Size') || '0', 10);

      if (!serverHash) {
        toast.warning(`[WARN] ? Aviso: Hash SHA256 nao fornecido pelo servidor. Download ${scriptType} continuara sem validacao.`);
        logger.warn('Server did not provide X-Script-SHA256 header', { platform });
      }

      // Calculate SHA256 of downloaded script
      const arrayBuffer = await scriptBlob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Compare hashes
      if (serverHash && calculatedHash.toLowerCase() !== serverHash.toLowerCase()) {
        toast.dismiss();
        toast.error(`[ERROR]  FALHA DE SEGURANCA: Hash SHA256 do script ${scriptType} nao corresponde!`, {
          description: `Esperado: ${serverHash.slice(0, 16)}...\nRecebido: ${calculatedHash.slice(0, 16)}...`,
          duration: Infinity,
        });

        logger.error(`${scriptType} SHA256 mismatch detected`, {
          expected: serverHash,
          calculated: calculatedHash,
          enrollmentKey,
          scriptSize: arrayBuffer.byteLength,
          platform,
        });

        await supabase.functions.invoke('record-security-event', {
          body: {
            event_type: 'sha256_mismatch',
            severity: 'critical',
            resource_type: 'installer_script',
            resource_id: enrollmentKey,
            details: {
              expected_hash: serverHash,
              calculated_hash: calculatedHash,
              script_size: arrayBuffer.byteLength,
              platform,
            }
          }
        }).catch(err => logger.warn('Failed to record security event', err));

        setIsValidatingPs1(false);
        return;
      }

      // Validation successful
      toast.dismiss();
      toast.success(`[OK]  Integridade ${scriptType} verificada com sucesso!`, {
        description: `SHA256: ${calculatedHash.slice(0, 16)}... (${(arrayBuffer.byteLength / 1024).toFixed(2)} KB)`,
        duration: 5000,
      });

      setPs1Sha256(calculatedHash);
      setPs1SizeBytes(arrayBuffer.byteLength);

      logger.info(`${scriptType} SHA256 validation successful`, {
        hash: calculatedHash,
        size: arrayBuffer.byteLength,
        enrollmentKey,
        platform,
      });

      // Initiate download
      const url = window.URL.createObjectURL(scriptBlob);
      const a = document.createElement('a');
      a.href = url;
      const extension = platform === 'windows' ? 'ps1' : 'sh';
      a.download = `cybershield-installer-${agentName}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`? Script ${scriptType} baixado com sucesso`);

    } catch (error: any) {
      logger.error(`${platform.toUpperCase()} script download/validation error`, error);
      toast.error("Erro ao baixar/validar script", {
        description: error.message,
      });
    } finally {
      setIsValidatingPs1(false);
      toast.dismiss();
    }
  };

  const generateInstaller = async () => {
    setIsGenerating(true);
    
    try {
      toast.info("Gerando instalador para download...");
      const credentials = await generateCredentials();
      if (!credentials) return;

      // FASE 4: Use downloadAndVerifyScript (suporta Windows e Linux)
      await downloadAndVerifyScript(credentials.enrollmentKey, platform);

      // Track telemetry (non-critical)
      supabase.functions.invoke('track-installation-event', {
        body: {
          agent_name: agentName.trim(),
          event_type: 'downloaded',
          platform: platform,
          installation_method: 'download'
        }
      }).then(({ data, error }) => {
        if (error || (data && !data.ok)) {
          logger.warn('[telemetry] Failed to track downloaded event', { error, data });
        }
      }).catch(err => logger.warn('[telemetry] Exception tracking event', err));

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

  // FASE 2.1: Gerar credenciais + build EXE em um clique
  const handleGenerateExeDirectly = async () => {
    if (!isNameValid) {
      toast.error('Informe um nome valido para o agente');
      return;
    }

    // FASE 1.1: Verificar health do GitHub
    if (githubHealthy === false) {
      toast.error('[ERROR]  GitHub nao configurado. Contate o administrador.');
      return;
    }

    try {
      // FASE 2.2: Progresso - Preparando
      setBuildProgress({ 
        currentStep: 'preparing', 
        status: 'active', 
        message: 'Gerando credenciais e preparando ambiente...' 
      });
      toast.info('? Gerando credenciais...');
      
      // Se nao tem enrollment_key, gerar automaticamente
      if (!lastEnrollmentKey) {
        const credentials = await generateCredentials();
        if (!credentials) {
          setBuildProgress({ 
            currentStep: 'preparing', 
            status: 'error', 
            message: 'Falha ao gerar credenciais' 
          });
          return;
        }
      }

      // Iniciar build EXE
      await handleBuildExe();
    } catch (error: any) {
      logger.error('[Build] Erro ao gerar instalador', error);
      toast.error(`Erro: ${error.message}`);
      setExeBuildStatus('idle');
      setBuildProgress({ 
        currentStep: 'preparing', 
        status: 'error', 
        message: error.message || 'Erro desconhecido' 
      });
    }
  };

  const handleBuildExe = async () => {
    if (!isNameValid || !lastEnrollmentKey) {
      toast.error('Gere credenciais primeiro (clique em "Gerar Comando" ou "Baixar Script")');
      return;
    }

    // Check connectivity before starting
    if (!isOnline) {
      toast.error('Sem conexao com a internet. Verifique sua conexao e tente novamente.');
      return;
    }

    setExeBuildStatus('building');
    setExeBuildId(null);
    setExeDownloadUrl(null);
    setExeSha256(null);
    setExeFileSize(null);
    setGithubActionsUrl(null);
    
    toast.info('🔧 Iniciando build do EXE... Aguarde 2-3 minutos');

    try {
      // FASE 2.2: Update progress to dispatching
      setBuildProgress({
        currentStep: 'dispatching',
        status: 'active',
        message: 'Disparando workflow no GitHub Actions...'
      });
      
      const buildResult = await retryFetch(async () => {
        const { data, error } = await supabase.functions.invoke('build-agent-exe', {
          body: {
            agent_name: agentName.trim(),
            enrollment_key: lastEnrollmentKey
          }
        });

        if (error) throw error;
        return data;
      }, {
        maxRetries: 3,
        shouldRetry: (error) => {
          // Retry on network errors
          return error.message?.includes('Failed to fetch') || 
                 error.message?.includes('Network request failed');
        }
      });

      // FASE 2: Verificar se foi cache hit
      if (buildResult.cached) {
        logger.info('Build cache hit!', buildResult);
        setExeBuildId(buildResult.build_id);
        setExeBuildStatus('cached');
        setExeDownloadUrl(buildResult.download_url);
        setExeSha256(buildResult.sha256_hash);
        setExeFileSize(buildResult.file_size_bytes);
        
        setBuildProgress({
          currentStep: 'completed',
          status: 'completed',
          message: '✅ Instalador recuperado do cache!'
        });
        
        toast.success('⚡ Instalador recuperado do cache!', {
          description: 'Mesmo tenant/script - download instantâneo'
        });
        
        storage.remove('current-build');
        return;
      }

      const { build_id, github_actions_url } = buildResult;
      setExeBuildId(build_id);
      setGithubActionsUrl(github_actions_url || null);
      
      // FASE 2.2: Progress updated with GitHub URL
      setBuildProgress({
        currentStep: 'compiling',
        status: 'active',
        message: 'Compilando PS1 → EXE (aguarde 2-3 minutos)...',
        githubRunUrl: github_actions_url
      });

      // Save to localStorage for recovery
      storage.set('current-build', { 
        build_id, 
        agent_name: agentName.trim(),
        started_at: Date.now() 
      }, 30 * 60 * 1000); // 30min expiry

      logger.info('Build initiated with Realtime monitoring', { 
        build_id, 
        agent_name: agentName.trim(), 
        github_actions_url 
      });

      // FASE 2: Realtime subscription é configurado automaticamente via useBuildRealtime
      // O hook monitora exeBuildId e recebe updates via handleBuildStatusChange
      
      // Setup build timeout (5 min)
      const buildTimeoutId = setTimeout(() => {
        if (exeBuildStatus === 'building') {
          logger.warn('Build timeout reached');
          if (retryCount < MAX_RETRIES) {
            toast.warning('⚠️ Build timeout', {
              description: `Tentando novamente (${retryCount + 1}/${MAX_RETRIES}) em 30s...`,
              duration: 5000,
            });
            
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
              handleBuildExe();
            }, 30000);
          } else {
            setExeBuildStatus('failed');
            toast.error('Timeout: Build demorou mais de 5 minutos após múltiplas tentativas');
            setRetryCount(0);
            storage.remove('current-build');
          }
        }
      }, 300000); // 5 min timeout

      // Cleanup on unmount
      return () => clearTimeout(buildTimeoutId);

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
        toast.success(`[OK]  EXE pronto!`);
      } else if (buildData.build_status === 'failed') {
        setExeBuildStatus('failed');
        toast.error(`Falha: ${buildData.error_message}`);
      } else {
        toast.info('Build ainda em execucao...');
      }
    } catch (e) {
      logger.error('Refresh exception', e);
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand);
    
    // Track telemetry (non-critical)
    supabase.functions.invoke('track-installation-event', {
      body: {
        agent_name: agentName.trim(),
        event_type: 'command_copied',
        platform: platform,
        installation_method: 'one_click'
      }
    }).then(({ data, error }) => {
      if (error || (data && !data.ok)) {
        logger.warn('[telemetry] Failed to track copy event', { error, data });
      }
    }).catch(err => logger.warn('[telemetry] Exception tracking event', err));
    
    toast.success("[OK]  Comando copiado!");
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
            Instalacao simplificada em 3 passos - sem configuracao manual
          </p>
        </div>
      </div>

      {/* ESTADO GLOBAL DO INSTALADOR */}
      <Card className={`border-2 ${
        circuitBreakerOpen || !isOnline 
          ? "bg-destructive/10 border-destructive/30" 
          : githubHealthy === false 
            ? "bg-warning/10 border-warning/30" 
            : "bg-green-500/10 border-green-500/30"
      }`}>
        <CardContent className="py-6 text-center">
          <div className="text-4xl mb-2">
            {circuitBreakerOpen || !isOnline ? '🔴' : 
             githubHealthy === false ? '🟡' : '🟢'}
          </div>
          <h2 className="text-2xl font-bold">
            {circuitBreakerOpen || !isOnline 
              ? 'Sistema Temporariamente Indisponível' 
              : githubHealthy === false 
                ? 'Sistema Parcialmente Disponível' 
                : 'Sistema Pronto para Instalações'}
          </h2>
          <p className="text-muted-foreground mt-2">
            {circuitBreakerOpen 
              ? 'Aguarde alguns instantes e tente novamente' 
              : !isOnline 
                ? 'Verifique sua conexão com a internet' 
                : githubHealthy === false 
                  ? 'Build EXE indisponível, mas One-Click e Download funcionam' 
                  : '✓ Todos os métodos de instalação disponíveis'}
          </p>
        </CardContent>
      </Card>

      {/* Alerta de regeneracao de credenciais */}
      {searchParams.get("regenerated") === "true" && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <AlertTitle className="text-yellow-600 dark:text-yellow-400">
            Credenciais Regeneradas
          </AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground space-y-3">
            <p>
              O agente <strong>{agentName}</strong> teve suas credenciais invalidadas. 
              O instalador antigo nao funciona mais.
            </p>
            <p>
              Gere um novo metodo de instalacao abaixo e reinstale o agente na maquina alvo.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/diagnostics")}
              className="gap-2"
            >
              <Terminal className="h-3 w-3" />
              Voltar para Troubleshooting
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Circuit Breaker Warning - Humanizado */}
      {circuitBreakerOpen && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-600 dark:text-orange-400">⏸️ Pausado Temporariamente</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Servidor processando muitas requisições. Aguarde um momento.</span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                enrollmentCircuitBreaker.reset();
                toast.success("Pronto para tentar novamente!");
                logger.info('Circuit breaker manually reset by user');
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              🔄 Tentar Novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* FASE 1: Connectivity & Retry Status - Humanizado */}
      {!isOnline && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-red-600 dark:text-red-400">📴 Sem Internet</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Verificações pausadas até reconexão. Verifique sua conexão com a internet.
          </AlertDescription>
        </Alert>
      )}

      {isRetrying && isOnline && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Tentando Reconectar</AlertTitle>
          <AlertDescription>
            Houve uma falha na conexao. Tentando novamente automaticamente...
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
            Defina um nome unico e escolha a plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agentName">Nome do Agente</Label>
            <div className="relative">
              <Input
                id="agentName"
                data-testid="agent-name-input"
                placeholder="ex: servidor-web-01"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                disabled={isGenerating || exeBuildStatus === 'building'}
                className={agentNameError && agentNameError.startsWith('[ERROR] ') ? 'border-red-500' : ''}
              />
              {isCheckingName && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" data-testid="name-checking-spinner" />
              )}
            </div>
            {agentNameError && (
              <p 
                data-testid={agentNameError.startsWith('[OK] ') ? 'validation-success' : 'validation-error'}
                className={`text-sm mt-1 ${
                  agentNameError.startsWith('[OK] ') ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {agentNameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Plataforma</Label>
            <RadioGroup value={platform} onValueChange={(v: any) => setPlatform(v)} disabled={isGenerating || exeBuildStatus === 'building'} data-testid="platform-selector">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="windows" id="windows" data-testid="platform-windows" />
                <Label htmlFor="windows" className="cursor-pointer">Windows (PowerShell)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="linux" id="linux" data-testid="platform-linux" />
                <Label htmlFor="linux" className="cursor-pointer">Linux (Bash)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="macos" id="macos" data-testid="platform-macos" />
                <Label htmlFor="macos" className="cursor-pointer flex items-center gap-2">
                  <span>?</span> macOS (Bash)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {previewCredentials && (
            <Alert className="bg-green-50 dark:bg-green-950/30 border-green-500/50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-300">
                ✅ Credenciais Prontas!
              </AlertTitle>
              <AlertDescription className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Válidas por 24 horas</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Após 24h, você precisará gerar novas credenciais
                </div>
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
            Escolher Metodo de Instalacao
          </CardTitle>
          <CardDescription>
            Selecione como deseja instalar o agente no servidor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="one-click" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="one-click" className="relative">
                <Zap className="h-4 w-4 mr-2" />
                Comando Rápido
                <Badge className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 bg-green-500 text-white border-0">
                  Recomendado
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="download">
                <Download className="h-4 w-4 mr-2" />
                Baixar Script
              </TabsTrigger>
              <TabsTrigger value="exe-build">
                <FileCheck className="h-4 w-4 mr-2" />
                Gerar EXE
              </TabsTrigger>
            </TabsList>

            <TabsContent value="one-click" className="space-y-4 mt-4">
              <Alert className="bg-green-50/50 dark:bg-green-950/20 border-green-500/30">
                <Zap className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700 dark:text-green-300">⚡ Ideal para servidores com internet</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  Pronto em segundos. Cole no PowerShell/Terminal como Administrador. Válido por 24h.
                </AlertDescription>
              </Alert>

              {platform === 'macos' && (
                <Alert className="mt-4">
                  <Terminal className="h-4 w-4" />
                  <AlertTitle>Instrucoes para macOS</AlertTitle>
                  <AlertDescription className="space-y-2 text-sm">
                    <ol className="list-decimal list-inside space-y-2">
                      <li>
                        <strong>Abra o Terminal</strong> no macOS (? + Espaco ? "Terminal")
                      </li>
                      <li>
                        <strong>Execute o comando gerado</strong> abaixo com <code className="bg-muted px-1 rounded">sudo</code>
                      </li>
                      <li>
                        O instalador criara um <strong>LaunchDaemon</strong> que iniciara automaticamente
                      </li>
                      <li>
                        Verifique o status com: <code className="bg-muted px-1 rounded">launchctl list | grep cybershield</code>
                      </li>
                    </ol>
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs">
                      <strong>[WARN] ? Permissoes:</strong> O instalador precisa de privilegios de administrador (sudo). 
                      O agente sera instalado em <code>/Library/Application Support/CyberShield</code>.
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={generateCopyPasteCommand} 
                disabled={!isNameValid || isGenerating || circuitBreakerOpen}
                className="w-full"
                data-testid="generate-command-btn"
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
                <div className="space-y-2" data-testid="install-command-container">
                  <Label>Comando de Instalacao</Label>
                  <div className="flex gap-2">
                    <Input value={installCommand} readOnly className="font-mono text-xs" data-testid="install-command" />
                    <Button onClick={copyToClipboard} variant="outline" size="icon" data-testid="copy-command-btn">
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
              <Alert className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/30">
                <Download className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-700 dark:text-blue-300">💾 Para instalação em redes isoladas</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  Baixe o script e transfira via USB ou rede interna. Valide a integridade antes de usar.
                </AlertDescription>
              </Alert>

              {lastEnrollmentKey && (
                <Card className="border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      Seguranca Validada
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span>SHA256 sera validado automaticamente</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span>Download bloqueado se hash nao corresponder</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span>Integridade verificada em tempo real</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button 
                onClick={() => lastEnrollmentKey ? downloadAndVerifyScript(lastEnrollmentKey, platform) : generateInstaller()} 
                disabled={!isNameValid || isGenerating || isValidatingPs1 || circuitBreakerOpen}
                className="w-full"
              >
                {isValidatingPs1 ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando Integridade...
                  </>
                ) : isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Script {platform === 'windows' ? '(.PS1)' : '(.SH)'} com Validacao SHA256
                  </>
                )}
              </Button>

              {ps1Sha256 && (
                <div className="mt-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                  <p className="text-sm text-green-800 dark:text-green-200 font-mono flex items-center justify-between">
                    <span className="flex items-center">
                      <Shield className="mr-2 h-4 w-4" />
                      SHA256: {ps1Sha256.slice(0, 16)}...{ps1Sha256.slice(-16)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(ps1Sha256);
                        toast.success("Hash copiado");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    [OK]  Integridade verificada ({(ps1SizeBytes! / 1024).toFixed(2)} KB) - {platform === 'windows' ? 'Windows PowerShell' : 'Linux Bash'}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="exe-build" className="space-y-4 mt-4">
              <Alert className="bg-purple-50/50 dark:bg-purple-950/20 border-purple-500/30">
                <FileCheck className="h-4 w-4 text-purple-600" />
                <AlertTitle className="text-purple-700 dark:text-purple-300">🖥️ Arquivo .EXE portátil para Windows</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  Executável independente que não requer PowerShell. Leva 2-3 minutos para compilar.
                </AlertDescription>
              </Alert>

              {/* FASE 1.1: Alerta de GitHub nao configurado */}
              {githubHealthy === false && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>GitHub Nao Configurado</AlertTitle>
                  <AlertDescription>
                    O build automatico requer configuracao do GitHub. Contate o administrador do sistema.
                  </AlertDescription>
                </Alert>
              )}

              {/* FASE 2.1: Botao simplificado - gera credenciais + build em um clique */}
              <Button 
                onClick={handleGenerateExeDirectly} 
                disabled={!isNameValid || exeBuildStatus === 'building' || circuitBreakerOpen || githubHealthy === false}
                className="w-full"
                size="lg"
              >
                {exeBuildStatus === 'building' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Compilando...
                  </>
                ) : exeBuildStatus === 'cached' ? (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    ⚡ Cache Hit - Download Pronto!
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Gerar Instalador EXE (2-3 minutos)
                  </>
                )}
              </Button>
              
              <p className="text-sm text-muted-foreground text-center">
                Gera automaticamente credenciais e compila instalador executavel
              </p>

              {/* Opcao avancada: build manual (para quem ja tem credenciais) */}
              {lastEnrollmentKey && exeBuildStatus !== 'building' && (
                <div className="mt-4 p-3 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Opcao Avancada:</p>
                  <Button 
                    onClick={handleBuildExe} 
                    disabled={!isNameValid || !lastEnrollmentKey || circuitBreakerOpen}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    Rebuildar EXE com credenciais existentes
                  </Button>
                </div>
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
              Acompanhe o progresso da geracao do executavel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {exeBuildStatus === 'building' && (
              <div className="space-y-3">
                {/* FASE 2.2: Enhanced visual progress */}
                <BuildProgressIndicator progress={buildProgress} />
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Monitorando via Realtime...
                  </span>
                  <Button onClick={refreshBuildStatus} variant="ghost" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar
                  </Button>
                </div>

                {buildProgress.currentStep === 'compiling' && (
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertTitle>Build em Andamento</AlertTitle>
                    <AlertDescription>
                      O build geralmente leva 2-3 minutos. Você será notificado quando concluir.
                    </AlertDescription>
              </Alert>
            )}
            
            {/* FASE 4: Card de fallback manual */}
            {(exeBuildStatus !== 'building' && exeBuildStatus !== 'completed') && (
              <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                    <AlertTriangle className="h-5 w-5" />
                    Build Falhando? Compile Manualmente
                  </CardTitle>
                  <CardDescription>
                    Se o build automatico nao funcionar, voce pode compilar o instalador localmente
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>
                      Baixe o script PS1 na aba "Download Manual" acima
                    </li>
                    <li>
                      Instale ps2exe no PowerShell (como admin):
                      <code className="block mt-1 p-2 bg-white dark:bg-gray-900 rounded text-xs font-mono">
                        Install-Module -Name ps2exe -Force
                      </code>
                    </li>
                    <li>
                      Compile para EXE:
                      <code className="block mt-1 p-2 bg-white dark:bg-gray-900 rounded text-xs font-mono">
                        ps2exe -InputFile installer.ps1 -OutputFile installer.exe -requireAdmin
                      </code>
                    </li>
                    <li>
                      Execute o installer.exe como administrador no servidor Windows
                    </li>
                  </ol>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open('/docs/BUILD_WINDOWS_INSTALLER.md', '_blank')}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Ver guia completo de compilacao manual
                  </Button>
                  
                  <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <HelpCircle className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-800 dark:text-blue-200">Dica</AlertTitle>
                    <AlertDescription className="text-blue-700 dark:text-blue-300 text-xs">
                      A compilacao manual e util para ambientes offline ou com restricoes de firewall que bloqueiam GitHub Actions.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
              </div>
            )}

            {exeBuildStatus === 'completed' && (
              <Alert id="exe-download" className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">[OK]  Build Concluido com Seguranca!</AlertTitle>
                <AlertDescription className="space-y-3">
                  <div className="space-y-2 p-3 bg-green-100 dark:bg-green-900 rounded-md">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-green-800 dark:text-green-200">? Verificacao de Integridade</span>
                      <Badge variant="outline" className="bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 border-green-400">
                        SHA-256
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs text-green-700 dark:text-green-300 font-mono">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{exeSha256?.slice(0, 32)}...</span>
                        <Button 
                          onClick={() => {
                            navigator.clipboard.writeText(exeSha256!);
                            toast.success("Hash copiado!");
                          }}
                          variant="ghost" 
                          size="sm"
                          className="h-6 px-2"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div>Tamanho: <strong>{(exeFileSize! / 1024 / 1024).toFixed(2)} MB</strong></div>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 italic">
                      ? O download sera validado automaticamente antes da instalacao
                    </p>
                  </div>
                  <Button onClick={downloadAndVerifyExe} className="w-full bg-green-600 hover:bg-green-700">
                    <Shield className="h-4 w-4 mr-2" />
                    Download Seguro com Validacao SHA-256
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
                      ? `Falhou apos ${retryCount} tentativa(s) automatica(s)` 
                      : 'Ocorreu um erro durante a compilacao do executavel.'
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
            Tutorial Rapido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible defaultValue={tutorialDefaultOpen}>
            <AccordionItem value="tutorial">
              <AccordionTrigger>Como instalar o agente?</AccordionTrigger>
              <AccordionContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Badge className="rounded-full">1</Badge>
                    <div>
                      <p className="font-medium">Configure o nome e plataforma</p>
                      <p className="text-sm text-muted-foreground">Escolha um nome unico (ex: servidor-web-01)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge className="rounded-full">2</Badge>
                    <div>
                      <p className="font-medium">Escolha o metodo de instalacao</p>
                      <p className="text-sm text-muted-foreground">One-Click e o mais rapido, EXE e o mais portavel</p>
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
                      <p className="font-medium">Aguarde a confirmacao</p>
                      <p className="text-sm text-muted-foreground">O agente aparecera na lista de agentes em ate 1 minuto</p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-methods">
              <AccordionTrigger>Qual metodo de instalacao escolher?</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div>
                  <p className="font-medium">Comando One-Click</p>
                  <p className="text-sm text-muted-foreground">[OK]  Mais rapido | [WARN] ? Requer internet no servidor</p>
                </div>
                <div>
                  <p className="font-medium">Baixar Script</p>
                  <p className="text-sm text-muted-foreground">[OK]  Funciona offline | [WARN] ? Requer copiar arquivo manualmente</p>
                </div>
                <div>
                  <p className="font-medium">Build EXE</p>
                  <p className="text-sm text-muted-foreground">[OK]  Executavel portavel | [WARN] ? Leva 2-3 minutos para gerar</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="faq-security">
              <AccordionTrigger>E seguro?</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  Sim! O instalador valida o SHA256 do script antes de executar, protegendo contra ataques MITM.
                  As credenciais expiram em 24h e sao unicas para cada agente.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* FRASE ÂNCORA DE CONFIANÇA */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            💡 Os instaladores são validados automaticamente com SHA-256.
            <br />
            <span className="text-primary font-medium">Suas credenciais são únicas e expiram em 24h para máxima segurança.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;