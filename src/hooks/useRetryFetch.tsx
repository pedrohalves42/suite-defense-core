import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  onRetry?: (attempt: number, error: any) => void;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Hook para fazer fetch com retry automático e exponential backoff
 * Trata erros de rede de forma resiliente
 */
export function useRetryFetch() {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const retryFetch = useCallback(async <T,>(
    fetchFn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> => {
    const {
      maxRetries = 3,
      initialDelay = 2000,
      onRetry,
      shouldRetry = () => true,
    } = options;

    let lastError: any;
    setRetryCount(0);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fetchFn();
        setIsRetrying(false);
        setRetryCount(0);
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Check if we should retry this error
        if (!shouldRetry(error)) {
          logger.error('[useRetryFetch] Error não retryable', error);
          throw error;
        }

        logger.warn(`[useRetryFetch] Tentativa ${attempt + 1}/${maxRetries} falhou`, error);

        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt);
          setIsRetrying(true);
          setRetryCount(attempt + 1);

          // Call retry callback if provided
          if (onRetry) {
            onRetry(attempt + 1, error);
          }

          // Show toast only on network errors
          const isNetworkError = error.message?.includes('Failed to fetch') || 
                                error.message?.includes('Network request failed') ||
                                error.name === 'TypeError';

          if (isNetworkError) {
            toast.info(`Tentativa ${attempt + 1}/${maxRetries} falhou. Tentando novamente em ${delay/1000}s...`, {
              duration: delay,
            });
          }

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    setIsRetrying(false);
    logger.error(`[useRetryFetch] Todas as ${maxRetries} tentativas falharam`, lastError);
    throw lastError;
  }, []);

  return { retryFetch, isRetrying, retryCount };
}
