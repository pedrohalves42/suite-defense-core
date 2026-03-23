import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

/**
 * Hook para detectar status de conectividade online/offline
 * Atualiza automaticamente quando a conexao cai ou volta
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  // TUNING: Remove wasOffline from deps - was causing unnecessary re-subscriptions
  useEffect(() => {
    const handleOnline = () => {
      logger.info('[useOnlineStatus] Conexao restaurada');
      setIsOnline(true);
      setWasOffline(false);
    };

    const handleOffline = () => {
      logger.warn('[useOnlineStatus] Conexao perdida');
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
