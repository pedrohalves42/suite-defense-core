import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { CircuitBreaker, CircuitState } from '@/lib/circuit-breaker';
import { retryWithBackoff, calculateSha256, trackInstallationEvent, getInstallUrl } from '../utils';
import type { Platform, PreviewCredentials } from '../types';

export function useAgentCredentials(
  agentName: string,
  platform: Platform,
  isNameValid: boolean,
  enrollmentCircuitBreaker: CircuitBreaker
) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastEnrollmentKey, setLastEnrollmentKey] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState('');
  const [previewCredentials, setPreviewCredentials] = useState<PreviewCredentials | null>(null);
  const [ps1Sha256, setPs1Sha256] = useState<string | null>(null);
  const [ps1SizeBytes, setPs1SizeBytes] = useState<number | null>(null);
  const [isValidatingPs1, setIsValidatingPs1] = useState(false);

  const generateCredentials = async () => {
    if (!isNameValid) { toast.error('Nome do agente invalido'); return null; }
    if (enrollmentCircuitBreaker.getState() === CircuitState.OPEN) {
      throw new Error('Backend temporariamente indisponivel.');
    }

    const { data: credentials, error: credError } = await retryWithBackoff(
      () => enrollmentCircuitBreaker.execute(() =>
        supabase.functions.invoke('auto-generate-enrollment', { body: { agentName: agentName.trim(), platform } })
      )
    );
    if (credError) throw credError;
    if (!credentials) throw new Error('Nenhuma credencial retornada');

    setPreviewCredentials({ agentId: credentials.agentId, expiresAt: credentials.expiresAt });
    setLastEnrollmentKey(credentials.enrollmentKey);
    return credentials;
  };

  const generateCopyPasteCommand = async () => {
    setIsGenerating(true);
    try {
      toast.info('Gerando comando one-click...');
      const credentials = await generateCredentials();
      if (!credentials) return;

      if (credentials.hmacSecret) {
        try {
          const { data: validationResult, error: validationError } = await supabase.functions.invoke('validate-hmac-signature', {
            body: { hmac_secret: credentials.hmacSecret, test_payload: 'installation_test' },
          });
          if (validationError || !validationResult?.valid) {
            toast.warning('[WARN] ? Aviso de seguranca', { description: 'A assinatura HMAC pode estar incorreta.', duration: 10000 });
          } else {
            toast.success('[OK]  Validacao de seguranca OK', { duration: 3000 });
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
      toast.success('[OK]  Comando gerado!', { description: 'Copie e execute no servidor' });
    } catch (error) {
      const err = error as Error & { context?: { requestId?: string } };
      logger.error('Generate command error', err);
      let description = err.message || 'Erro desconhecido';
      if (err.context?.requestId) description += ` (ID: ${err.context.requestId})`;
      toast.error('Erro ao gerar comando', { description, duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadAndVerifyScript = async (enrollmentKey: string, targetPlatform: Platform) => {
    if (!enrollmentKey) { toast.error('Enrollment key nao disponivel'); return; }
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
      toast.error('Erro ao baixar/validar script', { description: err.message });
    } finally {
      setIsValidatingPs1(false);
      toast.dismiss();
    }
  };

  const generateInstaller = async () => {
    setIsGenerating(true);
    try {
      toast.info('Gerando instalador para download...');
      const credentials = await generateCredentials();
      if (!credentials) return;
      await downloadAndVerifyScript(credentials.enrollmentKey, platform);
      trackInstallationEvent({ agent_name: agentName.trim(), event_type: 'downloaded', platform, installation_method: 'download' });
    } catch (error) {
      const err = error as Error & { context?: { requestId?: string } };
      logger.error('Generate installer error', err);
      let description = err.message || 'Erro desconhecido';
      if (err.context?.requestId) description += ` (ID: ${err.context.requestId})`;
      toast.error('Erro ao gerar instalador', { description, duration: 6000 });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePortableInstaller = async (
    setBuildProgress: (p: any) => void,
    setExeBuildStatus: (s: any) => void,
    setExeDownloadUrl: (u: string | null) => void,
    setExeSha256: (h: string | null) => void,
    setExeFileSize: (s: number | null) => void,
  ) => {
    if (!isNameValid) { toast.error('Informe um nome valido'); return; }
    try {
      setBuildProgress({ currentStep: 'preparing', status: 'active', message: 'Gerando credenciais...' });
      setExeBuildStatus('building');
      toast.info('🔧 Gerando instalador portátil...');

      let enrollmentKey = lastEnrollmentKey;
      if (!enrollmentKey) {
        const credentials = await generateCredentials();
        if (!credentials) { setBuildProgress({ currentStep: 'preparing', status: 'error', message: 'Falha' }); setExeBuildStatus('idle'); return; }
        enrollmentKey = credentials.enrollmentKey;
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

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(installCommand);
    trackInstallationEvent({ agent_name: agentName.trim(), event_type: 'command_copied', platform, installation_method: 'one_click' });
    toast.success('[OK]  Comando copiado!');
  };

  return {
    isGenerating, lastEnrollmentKey, installCommand, previewCredentials,
    ps1Sha256, ps1SizeBytes, isValidatingPs1,
    generateCopyPasteCommand, generateInstaller, downloadAndVerifyScript,
    handleGeneratePortableInstaller, copyToClipboard,
  };
}
