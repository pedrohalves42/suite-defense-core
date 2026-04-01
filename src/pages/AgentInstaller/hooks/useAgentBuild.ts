import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useRetryFetch } from '@/hooks/useRetryFetch';
import { useBuildRealtime, BuildStatus } from '@/hooks/useBuildRealtime';
import { storage } from '@/lib/storage';
import { retryWithBackoff, calculateSha256 } from '../utils';
import type { BuildProgressState, ExeBuildStatus } from '../types';

const MAX_RETRIES = 2;

export function useAgentBuild(agentName: string, lastEnrollmentKey: string | null, isNameValid: boolean) {
  const { retryFetch } = useRetryFetch();
  const [exeBuildStatus, setExeBuildStatus] = useState<ExeBuildStatus>('idle');
  const [exeBuildId, setExeBuildId] = useState<string | null>(null);
  const [exeDownloadUrl, setExeDownloadUrl] = useState<string | null>(null);
  const [exeSha256, setExeSha256] = useState<string | null>(null);
  const [exeFileSize, setExeFileSize] = useState<number | null>(null);
  const [githubActionsUrl, setGithubActionsUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [githubHealthy, setGithubHealthy] = useState<boolean | null>(null);
  const [buildProgress, setBuildProgress] = useState<BuildProgressState>({
    currentStep: 'preparing',
    status: 'pending',
    message: 'Aguardando inicio...',
  });

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

  // Recover in-progress build
  useEffect(() => {
    const savedBuild = storage.get<{ build_id: string; agent_name: string; started_at: number }>('current-build');
    if (savedBuild && Date.now() - savedBuild.started_at < 15 * 60 * 1000) {
      logger.info('[Recovery] Build em progresso detectado', savedBuild);
      toast.info('Recuperando build em progresso...', { description: `Agente: ${savedBuild.agent_name}` });
      setExeBuildId(savedBuild.build_id);
      setExeBuildStatus('building');
    }
  }, []);

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

  // Notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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

  const handleBuildExe = async () => {
    if (!isNameValid || !lastEnrollmentKey) { toast.error('Gere credenciais primeiro'); return; }

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
    if (!exeDownloadUrl || !exeSha256) { toast.error('Informacoes de download incompletas'); return; }
    try {
      toast.info('? Baixando e verificando integridade...', { duration: Infinity });
      const response = await fetch(exeDownloadUrl);
      if (!response.ok) throw new Error('Falha ao baixar arquivo');
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const calculatedHash = await calculateSha256(arrayBuffer);

      if (calculatedHash.toLowerCase() !== exeSha256.toLowerCase()) {
        toast.dismiss();
        toast.error('[ERROR]  FALHA DE SEGURANCA: Hash SHA256 nao corresponde!', { duration: Infinity });
        logger.error('SHA256 mismatch detected', { expected: exeSha256, calculated: calculatedHash, buildId: exeBuildId, agentName });
        await supabase.functions.invoke('send-security-alert', {
          body: { alertType: 'integrity_failure', severity: 'critical', details: { expected_hash: exeSha256, calculated_hash: calculatedHash, build_id: exeBuildId, agent_name: agentName, download_url: exeDownloadUrl } }
        }).catch(err => logger.error('Failed to send security alert', err));
        return;
      }

      toast.dismiss();
      toast.success('[OK]  Integridade verificada! Iniciando download...');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cybershield-agent-${agentName}.exe`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('? Download concluido com seguranca!');
    } catch (error) {
      const err = error as Error;
      toast.dismiss();
      toast.error('Erro ao verificar integridade', { description: err.message, duration: 6000 });
    }
  };

  return {
    exeBuildStatus, exeBuildId, exeDownloadUrl, exeSha256, exeFileSize,
    githubActionsUrl, retryCount, githubHealthy, buildProgress,
    setBuildProgress, setExeBuildStatus, setExeDownloadUrl, setExeSha256, setExeFileSize,
    handleBuildExe, refreshBuildStatus, downloadAndVerifyExe,
  };
}
