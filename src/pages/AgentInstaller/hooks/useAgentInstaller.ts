import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { CircuitBreaker, CircuitState } from "@/lib/circuit-breaker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useRetryFetch } from "@/hooks/useRetryFetch";
import { useBuildRealtime, BuildStatus } from "@/hooks/useBuildRealtime";
import { storage } from "@/lib/storage";
import { retryWithBackoff, calculateSha256, trackInstallationEvent, getInstallUrl } from "../utils";
import type { Platform, BuildProgressState, ExeBuildStatus, PreviewCredentials } from "../types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function useAgentInstaller() {
  const { isOnline } = useOnlineStatus();
  const { retryFetch, isRetrying } = useRetryFetch();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Tutorial
  const [tutorialDefaultOpen] = useState(() => {
    const seen = localStorage.getItem('installer-tutorial-seen');
    if (!seen) {
      localStorage.setItem('installer-tutorial-seen', 'true');
      return 'tutorial';
    }
    return undefined;
  });

  // Step 1: Configuration
  const [agentName, setAgentName] = useState("");
  const [platform, setPlatform] = useState<Platform>("windows");
  const [agentNameError, setAgentNameError] = useState("");
  const [isCheckingName, setIsCheckingName] = useState(false);

  // GitHub health
  const [githubHealthy, setGithubHealthy] = useState<boolean | null>(null);

  // Build progress
  const [buildProgress, setBuildProgress] = useState<BuildProgressState>({
    currentStep: 'preparing',
    status: 'pending',
    message: 'Aguardando inicio...',
  });

  // Step 2: Generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastEnrollmentKey, setLastEnrollmentKey] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState("");
  const [previewCredentials, setPreviewCredentials] = useState<PreviewCredentials | null>(null);

  // Step 3: EXE Build
  const [exeBuildStatus, setExeBuildStatus] = useState<ExeBuildStatus>('idle');
  const [exeBuildId, setExeBuildId] = useState<string | null>(null);
  const [exeDownloadUrl, setExeDownloadUrl] = useState<string | null>(null);
  const [exeSha256, setExeSha256] = useState<string | null>(null);
  const [exeFileSize, setExeFileSize] = useState<number | null>(null);
  const [githubActionsUrl, setGithubActionsUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;

  // PS1 validation
  const [ps1Sha256, setPs1Sha256] = useState<string | null>(null);
  const [ps1SizeBytes, setPs1SizeBytes] = useState<number | null>(null);
  const [isValidatingPs1, setIsValidatingPs1] = useState(false);

  // Circuit Breaker
  const [enrollmentCircuitBreaker] = useState(() => new CircuitBreaker({
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 60000,
    name: 'auto-generate-enrollment',
  }));
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);

  // ─── Effects ───────────────────────────────────────────────

  // Detect URL params (regenerated credentials)
  useEffect(() => {
    const agentNameFromUrl = searchParams.get("agent_name");
    const isRegenerated = searchParams.get("regenerated") === "true";
    if (agentNameFromUrl) setAgentName(agentNameFromUrl);
    if (agentNameFromUrl && isRegenerated) {
      toast.info(
        `? Agente "${agentNameFromUrl}" teve credenciais regeneradas. O instalador antigo NAO funciona mais. Gere um novo abaixo.`,
        { duration: 8000 }
      );
    }
  }, [searchParams]);

  // GitHub health check
  useEffect(() => {
    const checkGithubHealth = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('build-agent-exe', { method: 'GET' });
        if (error) throw error;
        const healthy = data?.checks?.github_token && data?.checks?.github_repo;
        setGithubHealthy(healthy);
        if (!healthy) logger.warn('[Health Check] GitHub nao configurado', data);
        else logger.info('[Health Check] GitHub configurado e pronto');
      } catch (error) {
        logger.error('[Health Check] Erro ao verificar GitHub', error);
        setGithubHealthy(false);
      }
    };
    checkGithubHealth();
  }, []);

  // Notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Recover in-progress build
  useEffect(() => {
    const savedBuild = storage.get<{ build_id: string; agent_name: string; started_at: number }>('current-build');
    if (savedBuild && Date.now() - savedBuild.started_at < 15 * 60 * 1000) {
      logger.info('[Recovery] Build em progresso detectado', savedBuild);
      toast.info('Recuperando build em progresso...', { description: `Agente: ${savedBuild.agent_name}` });
      setExeBuildId(savedBuild.build_id);
      setAgentName(savedBuild.agent_name);
      setExeBuildStatus('building');
    }
  }, []);

  // Circuit breaker monitor
  useEffect(() => {
    const interval = setInterval(() => {
      const state = enrollmentCircuitBreaker.getState();
      const wasOpen = circuitBreakerOpen;
      const isNowOpen = state === CircuitState.OPEN;
      setCircuitBreakerOpen(isNowOpen);
      if (!wasOpen && isNowOpen) logger.warn('Circuit breaker ABERTO');
      else if (wasOpen && !isNowOpen) logger.info('Circuit breaker FECHADO');
    }, 1000);
    return () => clearInterval(interval);
  }, [circuitBreakerOpen, enrollmentCircuitBreaker]);

  // Agent name validation
  useEffect(() => {
    if (!agentName) { setAgentNameError(""); return; }

    const invalidChars = /[^a-zA-Z0-9\-_]/;
    if (invalidChars.test(agentName)) { setAgentNameError("[ERROR]  Use apenas letras, numeros, hifens e underscores"); return; }
    if (agentName.length < 3) { setAgentNameError("[ERROR]  Nome deve ter pelo menos 3 caracteres"); return; }
    if (agentName.length > 50) { setAgentNameError("[ERROR]  Maximo de 50 caracteres"); return; }

    const abortController = new AbortController();
    let isMounted = true;

    const timer = setTimeout(async () => {
      if (!isMounted) return;
      setIsCheckingName(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const checkNameWithRetry = async (retries = 2): Promise<void> => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            if (isMounted) { setAgentNameError('[ERROR]  Sessao expirada.'); setIsCheckingName(false); }
            return;
          }
          if (abortController.signal.aborted || !isMounted) return;

          const { data, error } = await supabase.functions.invoke('check-agent-name-availability', {
            body: { agentName },
            headers: { Authorization: `Bearer ${session.access_token}` },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (abortController.signal.aborted || !isMounted) return;
          if (error) throw error;
          if (isMounted) {
            setAgentNameError(!data.available ? `[ERROR]  ${data.reason || 'Nome indisponivel'}` : '[OK]  Nome disponivel');
          }
        } catch (err) {
          const error = err as Error & { name?: string };
          if (error.name === 'AbortError') {
            if (isMounted) setAgentNameError('?? Timeout - tente novamente');
          } else if (retries > 0) {
            await new Promise(r => setTimeout(r, 1000 * (3 - retries)));
            return checkNameWithRetry(retries - 1);
          } else {
            if (abortController.signal.aborted || !isMounted) return;
            if (isMounted) setAgentNameError('[ERROR]  Erro ao validar - verifique sua conexao');
          }
        } finally {
          if (isMounted) setIsCheckingName(false);
        }
      };

      await checkNameWithRetry();
    }, 800);

    return () => { isMounted = false; abortController.abort(); clearTimeout(timer); };
  }, [agentName]);

  const isNameValid = agentName.length >= 3 && agentName.length <= 50 && !/[^a-zA-Z0-9\-_]/.test(agentName) && !agentNameError.startsWith('[ERROR] ');

  // Build timeout
  useEffect(() => {
    if (exeBuildStatus === 'building' && exeBuildId) {
      const timeout = setTimeout(() => {
        toast.error('[WARN] ? Build Timeout', { description: 'Build esta demorando mais que o esperado.', duration: 10000 });
        setExeBuildStatus('failed');
        setRetryCount(0);
      }, 300000);
      return () => clearTimeout(timeout);
    }
  }, [exeBuildStatus, exeBuildId]);

  // Build completion notifications
  useEffect(() => {
    if (exeBuildStatus === 'completed' && exeDownloadUrl) {
      if (Notification.permission === 'granted') {
        const notification = new Notification('? Build EXE Concluido!', {
          body: `${agentName} esta pronto para download`,
          icon: '/favicon.ico',
          tag: `build-${exeBuildId}`,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          document.getElementById('exe-download')?.scrollIntoView({ behavior: 'smooth' });
          notification.close();
        };
      }

      let flash = true;
      const titleInterval = setInterval(() => {
        document.title = flash ? '[OK]  EXE Pronto! | CyberShield' : 'CyberShield Agent Installer';
        flash = !flash;
      }, 1000);
      const stopFlashing = () => { clearInterval(titleInterval); document.title = 'CyberShield Agent Installer'; document.removeEventListener('visibilitychange', stopFlashing); };
      setTimeout(stopFlashing, 10000);
      document.addEventListener('visibilitychange', stopFlashing);

      toast.success('[OK]  EXE Pronto para Download!', { description: 'Seu instalador esta pronto', duration: 30000 });
    }
  }, [exeBuildStatus, exeDownloadUrl, agentName, exeBuildId]);

  // ─── Realtime ──────────────────────────────────────────────

  const handleBuildStatusChange = useCallback((status: BuildStatus) => {
    logger.info('[Realtime] Build status changed', status);
    if (status.github_run_url && !githubActionsUrl) setGithubActionsUrl(status.github_run_url);

    if (status.build_status === 'completed') {
      setExeBuildStatus('completed');
      setExeDownloadUrl(status.download_url);
      setExeSha256(status.sha256_hash);
      setExeFileSize(status.file_size_bytes);
      setRetryCount(0);
      storage.remove('current-build');
      setBuildProgress({ currentStep: 'completed', status: 'completed', message: 'Build concluído com sucesso!', githubRunUrl: status.github_run_url || undefined });
      toast.success(`✅ EXE gerado em ${status.build_duration_seconds || 0}s!`, { description: 'Clique em Download para baixar' });
    } else if (status.build_status === 'failed') {
      storage.remove('current-build');
      if (retryCount < MAX_RETRIES) {
        toast.warning('⚠️ Build falhou', { description: `Tentando novamente (${retryCount + 1}/${MAX_RETRIES}) em 30s...`, duration: 5000 });
        setTimeout(() => { setRetryCount(prev => prev + 1); handleBuildExe(); }, 30000);
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
    onError: () => { startPollingFallback(); },
  });

  const startPollingFallback = useCallback(() => {
    if (!exeBuildId || exeBuildStatus !== 'building') return;
    const pollInterval = setInterval(async () => {
      const status = await fetchBuildStatus();
      if (status) {
        handleBuildStatusChange(status);
        if (status.build_status === 'completed' || status.build_status === 'failed') clearInterval(pollInterval);
      }
    }, 10000);
    setTimeout(() => clearInterval(pollInterval), 300000);
  }, [exeBuildId, exeBuildStatus, fetchBuildStatus, handleBuildStatusChange]);

  // ─── Actions ───────────────────────────────────────────────

  const generateCredentials = async () => {
    if (!isNameValid) { toast.error("Nome do agente invalido"); return null; }
    if (enrollmentCircuitBreaker.getState() === CircuitState.OPEN) {
      throw new Error('Backend temporariamente indisponivel.');
    }

    const { data: credentials, error: credError } = await retryWithBackoff(
      () => enrollmentCircuitBreaker.execute(() =>
        supabase.functions.invoke('auto-generate-enrollment', { body: { agentName: agentName.trim(), platform } })
      )
    );
    if (credError) throw credError;
    if (!credentials) throw new Error("Nenhuma credencial retornada");

    setPreviewCredentials({ agentId: credentials.agentId, expiresAt: credentials.expiresAt });
    setLastEnrollmentKey(credentials.enrollmentKey);
    return credentials;
  };

  const generateCopyPasteCommand = async () => {
    setIsGenerating(true);
    try {
      toast.info("Gerando comando one-click...");
      const credentials = await generateCredentials();
      if (!credentials) return;

      if (credentials.hmacSecret) {
        try {
          const { data: validationResult, error: validationError } = await supabase.functions.invoke('validate-hmac-signature', {
            body: { hmac_secret: credentials.hmacSecret, test_payload: 'installation_test' },
          });
          if (validationError || !validationResult?.valid) {
            toast.warning("[WARN] ? Aviso de seguranca", { description: "A assinatura HMAC pode estar incorreta.", duration: 10000 });
          } else {
            toast.success("[OK]  Validacao de seguranca OK", { duration: 3000 });
          }
        } catch (e) {
          logger.error('[HMAC Validation] Exception:', e);
        }
      }

      const installUrl = getInstallUrl(credentials.enrollmentKey);
      const command = platform === 'windows'
        ? `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $sp="$env:TEMP\\cs-install-$(Get-Random).ps1"; Invoke-WebRequest -Uri ${installUrl} -OutFile $sp -UseBasicParsing; & $sp; Remove-Item $sp -Force`
        : `curl -sL ${installUrl} | sudo bash`;
      setInstallCommand(command);

      trackInstallationEvent({ agent_name: agentName.trim(), event_type: 'generated', platform, installation_method: 'one_click' });
      toast.success("[OK]  Comando gerado!", { description: "Copie e execute no servidor" });
    } catch (error) {
      const err = error as Error & { context?: { requestId?: string } };
      logger.error('Generate command error', err);
      let description = err.message || "Erro desconhecido";
      if (err.context?.requestId) description += ` (ID: ${err.context.requestId})`;
      toast.error("Erro ao gerar comando", { description, duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadAndVerifyScript = async (enrollmentKey: string, targetPlatform: Platform) => {
    if (!enrollmentKey) { toast.error("Enrollment key nao disponivel"); return; }
    setIsValidatingPs1(true);
    try {
      const scriptType = targetPlatform === 'windows' ? '.PS1' : '.SH';
      toast.info(`? Baixando script ${scriptType} e verificando integridade...`, { duration: Infinity });

      const installUrl = getInstallUrl(enrollmentKey);
      const response = await fetch(installUrl);
      if (!response.ok) throw new Error(`Falha ao baixar script: ${response.status}`);

      const scriptContent = await response.text();
      const scriptBlob = new Blob([scriptContent], { type: 'text/plain' });
      const serverHash = response.headers.get('X-Script-SHA256');

      if (!serverHash) {
        toast.warning(`[WARN] ? Hash SHA256 nao fornecido pelo servidor.`);
      }

      const arrayBuffer = await scriptBlob.arrayBuffer();
      const calculatedHash = await calculateSha256(arrayBuffer);

      if (serverHash && calculatedHash.toLowerCase() !== serverHash.toLowerCase()) {
        toast.dismiss();
        toast.error(`[ERROR]  FALHA DE SEGURANCA: Hash SHA256 do script ${scriptType} nao corresponde!`, { duration: Infinity });
        logger.error(`${scriptType} SHA256 mismatch`, { expected: serverHash, calculated: calculatedHash });
        await supabase.functions.invoke('record-security-event', {
          body: { event_type: 'sha256_mismatch', severity: 'critical', resource_type: 'installer_script', resource_id: enrollmentKey, details: { expected_hash: serverHash, calculated_hash: calculatedHash, script_size: arrayBuffer.byteLength, platform: targetPlatform } }
        }).catch(err => logger.warn('Failed to record security event', err));
        setIsValidatingPs1(false);
        return;
      }

      toast.dismiss();
      toast.success(`[OK]  Integridade ${scriptType} verificada com sucesso!`, { duration: 5000 });
      setPs1Sha256(calculatedHash);
      setPs1SizeBytes(arrayBuffer.byteLength);

      const url = window.URL.createObjectURL(scriptBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cybershield-installer-${agentName}.${targetPlatform === 'windows' ? 'ps1' : 'sh'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const err = error as Error;
      logger.error('Script download/validation error', err);
      toast.error("Erro ao baixar/validar script", { description: err.message });
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
      await downloadAndVerifyScript(credentials.enrollmentKey, platform);
      trackInstallationEvent({ agent_name: agentName.trim(), event_type: 'downloaded', platform, installation_method: 'download' });
    } catch (error) {
      const err = error as Error & { context?: { requestId?: string } };
      logger.error('Generate installer error', err);
      let description = err.message || "Erro desconhecido";
      if (err.context?.requestId) description += ` (ID: ${err.context.requestId})`;
      toast.error("Erro ao gerar instalador", { description, duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePortableInstaller = async () => {
    if (!isNameValid) { toast.error('Informe um nome valido'); return; }
    try {
      setBuildProgress({ currentStep: 'preparing', status: 'active', message: 'Gerando credenciais...' });
      setExeBuildStatus('building');
      toast.info('🔧 Gerando instalador portátil...');

      let enrollmentKey = lastEnrollmentKey;
      if (!enrollmentKey) {
        const credentials = await generateCredentials();
        if (!credentials) { setBuildProgress({ currentStep: 'preparing', status: 'error', message: 'Falha' }); setExeBuildStatus('idle'); return; }
        enrollmentKey = lastEnrollmentKey;
      }

      setBuildProgress({ currentStep: 'compiling', status: 'active', message: 'Gerando instalador portátil...' });
      const { data, error } = await supabase.functions.invoke('generate-portable-installer', {
        body: { agent_name: agentName.trim(), enrollment_key: enrollmentKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao gerar instalador');

      setExeDownloadUrl(data.download_url);
      setExeSha256(data.sha256_hash);
      setExeFileSize(data.file_size_bytes);
      setExeBuildStatus('completed');
      setBuildProgress({ currentStep: 'completed', status: 'completed', message: 'Instalador pronto!' });
      toast.success('✅ Instalador portátil gerado com sucesso!');
    } catch (error) {
      const err = error as Error;
      logger.error('[Portable] Erro', err);
      toast.error(`Erro: ${err.message}`);
      setExeBuildStatus('failed');
      setBuildProgress({ currentStep: 'preparing', status: 'error', message: err.message || 'Erro desconhecido' });
    }
  };

  const handleBuildExe = async () => {
    if (!isNameValid || !lastEnrollmentKey) { toast.error('Gere credenciais primeiro'); return; }
    if (!isOnline) { toast.error('Sem conexao com a internet.'); return; }

    setExeBuildStatus('building');
    setExeBuildId(null);
    setExeDownloadUrl(null);
    setExeSha256(null);
    setExeFileSize(null);
    setGithubActionsUrl(null);
    toast.info('🔧 Iniciando build do EXE...');

    try {
      setBuildProgress({ currentStep: 'dispatching', status: 'active', message: 'Disparando workflow no GitHub Actions...' });

      const buildResult = await retryFetch(async () => {
        const { data, error } = await supabase.functions.invoke('build-agent-exe', {
          body: { agent_name: agentName.trim(), enrollment_key: lastEnrollmentKey },
        });
        if (error) throw error;
        return data;
      }, {
        maxRetries: 3,
        shouldRetry: (error: any) => error.message?.includes('Failed to fetch') || error.message?.includes('Network request failed'),
      });

      if (buildResult.cached) {
        setExeBuildId(buildResult.build_id);
        setExeBuildStatus('cached');
        setExeDownloadUrl(buildResult.download_url);
        setExeSha256(buildResult.sha256_hash);
        setExeFileSize(buildResult.file_size_bytes);
        setBuildProgress({ currentStep: 'completed', status: 'completed', message: '✅ Instalador recuperado do cache!' });
        toast.success('⚡ Instalador recuperado do cache!');
        storage.remove('current-build');
        return;
      }

      const { build_id, github_actions_url } = buildResult;
      setExeBuildId(build_id);
      setGithubActionsUrl(github_actions_url || null);
      setBuildProgress({ currentStep: 'compiling', status: 'active', message: 'Compilando PS1 → EXE...', githubRunUrl: github_actions_url });
      storage.set('current-build', { build_id, agent_name: agentName.trim(), started_at: Date.now() }, 30 * 60 * 1000);
    } catch (error) {
      const err = error as Error;
      logger.error('Build EXE failed', err);
      setExeBuildStatus('failed');
      toast.error(`Erro ao gerar EXE: ${err.message || 'Erro desconhecido'}`);
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
      if (error) { toast.error('Erro ao atualizar status'); return; }
      if (buildData.github_run_url) setGithubActionsUrl(buildData.github_run_url);
      if (buildData.build_status === 'completed') {
        setExeBuildStatus('completed');
        setExeDownloadUrl(buildData.download_url);
        setExeSha256(buildData.sha256_hash);
        setExeFileSize(buildData.file_size_bytes);
        toast.success('[OK]  EXE pronto!');
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

  const downloadAndVerifyExe = async () => {
    if (!exeDownloadUrl || !exeSha256) { toast.error("Informacoes de download incompletas"); return; }
    try {
      toast.info("? Baixando e verificando integridade...", { duration: Infinity });
      const response = await fetch(exeDownloadUrl);
      if (!response.ok) throw new Error("Falha ao baixar arquivo");
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const calculatedHash = await calculateSha256(arrayBuffer);

      if (calculatedHash.toLowerCase() !== exeSha256.toLowerCase()) {
        toast.dismiss();
        toast.error("[ERROR]  FALHA DE SEGURANCA: Hash SHA256 nao corresponde!", { duration: Infinity });
        logger.error('SHA256 mismatch detected', { expected: exeSha256, calculated: calculatedHash, buildId: exeBuildId, agentName });
        await supabase.functions.invoke('send-security-alert', {
          body: { alertType: 'integrity_failure', severity: 'critical', details: { expected_hash: exeSha256, calculated_hash: calculatedHash, build_id: exeBuildId, agent_name: agentName, download_url: exeDownloadUrl } }
        }).catch(err => logger.error('Failed to send security alert', err));
        return;
      }

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
    } catch (error) {
      const err = error as Error;
      toast.dismiss();
      toast.error("Erro ao verificar integridade", { description: err.message, duration: 6000 });
    }
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand);
    trackInstallationEvent({ agent_name: agentName.trim(), event_type: 'command_copied', platform, installation_method: 'one_click' });
    toast.success("[OK]  Comando copiado!");
  };

  return {
    // State
    agentName, setAgentName, platform, setPlatform, agentNameError, isCheckingName,
    isNameValid, isGenerating, isRetrying, isOnline, isValidatingPs1,
    circuitBreakerOpen, githubHealthy, tutorialDefaultOpen,
    installCommand, previewCredentials, lastEnrollmentKey,
    exeBuildStatus, exeBuildId, exeDownloadUrl, exeSha256, exeFileSize,
    githubActionsUrl, retryCount, buildProgress,
    ps1Sha256, ps1SizeBytes,
    searchParams, navigate,
    enrollmentCircuitBreaker,
    // Actions
    generateCopyPasteCommand, generateInstaller, handleGeneratePortableInstaller,
    handleBuildExe, refreshBuildStatus, downloadAndVerifyExe, downloadAndVerifyScript,
    copyToClipboard,
  };
}
