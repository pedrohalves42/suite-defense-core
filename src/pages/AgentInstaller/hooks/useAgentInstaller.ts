import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRetryFetch } from '@/hooks/useRetryFetch';
import { CircuitBreaker, CircuitState } from '@/lib/circuit-breaker';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useAgentConfig } from './useAgentConfig';
import { useAgentBuild } from './useAgentBuild';
import { useAgentCredentials } from './useAgentCredentials';

export function useAgentInstaller() {
  const { isOnline } = useOnlineStatus();
  const { isRetrying } = useRetryFetch();
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

  // Circuit Breaker
  const [enrollmentCircuitBreaker] = useState(() => new CircuitBreaker({
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 60000,
    name: 'auto-generate-enrollment',
  }));
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);

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

  // Compose sub-hooks
  const config = useAgentConfig();
  const credentials = useAgentCredentials(
    config.agentName, config.platform, config.isNameValid, enrollmentCircuitBreaker
  );
  const build = useAgentBuild(config.agentName, credentials.lastEnrollmentKey, config.isNameValid);

  // Wrap portable installer to bridge build setters
  const handleGeneratePortableInstaller = () =>
    credentials.handleGeneratePortableInstaller(
      build.setBuildProgress, build.setExeBuildStatus,
      build.setExeDownloadUrl, build.setExeSha256, build.setExeFileSize,
    );

  return {
    // Config
    agentName: config.agentName,
    setAgentName: config.setAgentName,
    platform: config.platform,
    setPlatform: config.setPlatform,
    agentNameError: config.agentNameError,
    isCheckingName: config.isCheckingName,
    isNameValid: config.isNameValid,
    searchParams: config.searchParams,
    // Credentials
    isGenerating: credentials.isGenerating,
    installCommand: credentials.installCommand,
    previewCredentials: credentials.previewCredentials,
    lastEnrollmentKey: credentials.lastEnrollmentKey,
    ps1Sha256: credentials.ps1Sha256,
    ps1SizeBytes: credentials.ps1SizeBytes,
    isValidatingPs1: credentials.isValidatingPs1,
    generateCopyPasteCommand: credentials.generateCopyPasteCommand,
    generateInstaller: credentials.generateInstaller,
    downloadAndVerifyScript: credentials.downloadAndVerifyScript,
    copyToClipboard: credentials.copyToClipboard,
    handleGeneratePortableInstaller,
    // Build
    exeBuildStatus: build.exeBuildStatus,
    exeBuildId: build.exeBuildId,
    exeDownloadUrl: build.exeDownloadUrl,
    exeSha256: build.exeSha256,
    exeFileSize: build.exeFileSize,
    githubActionsUrl: build.githubActionsUrl,
    retryCount: build.retryCount,
    githubHealthy: build.githubHealthy,
    buildProgress: build.buildProgress,
    handleBuildExe: build.handleBuildExe,
    refreshBuildStatus: build.refreshBuildStatus,
    downloadAndVerifyExe: build.downloadAndVerifyExe,
    // Global
    isOnline,
    isRetrying,
    circuitBreakerOpen,
    enrollmentCircuitBreaker,
    tutorialDefaultOpen,
    navigate,
  };
}
