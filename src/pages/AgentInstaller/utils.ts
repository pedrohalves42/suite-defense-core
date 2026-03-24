import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Retry with exponential backoff
 */
export const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 2000
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        toast.info(`Tentativa ${attempt + 1}/${maxRetries} falhou. Tentando novamente em ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Validate installer integrity comparing SHA256
 */
export const validateInstallerIntegrity = async (
  blob: Blob,
  expectedSha256: string
): Promise<boolean> => {
  try {
    logger.info('[SHA256] Iniciando validacao de integridade', {
      expectedSha256,
      blobSize: blob.size,
    });

    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    logger.info('[SHA256] Hash calculado', {
      calculated: hashHex,
      expected: expectedSha256,
      match: hashHex === expectedSha256,
    });

    if (hashHex !== expectedSha256) {
      logger.error('[SHA256] MISMATCH DETECTADO!', {
        calculated: hashHex,
        expected: expectedSha256,
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

/**
 * Calculate SHA256 hash of an ArrayBuffer
 */
export const calculateSha256 = async (buffer: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Track telemetry event (non-blocking, non-critical)
 */
export const trackInstallationEvent = (body: Record<string, string>) => {
  supabase.functions
    .invoke('track-installation-event', { body })
    .then(({ data, error }) => {
      if (error || (data && !data.ok)) {
        logger.warn('[telemetry] Failed to track event', { error, data });
      }
    })
    .catch(err => logger.warn('[telemetry] Exception tracking event', err));
};

/**
 * Get the install URL for a given enrollment key
 */
export const getInstallUrl = (enrollmentKey: string): string =>
  `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`;
