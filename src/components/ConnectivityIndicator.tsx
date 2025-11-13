import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WifiOff, Wifi, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Componente que exibe feedback visual sobre o status de conectividade
 * Mostra alertas quando offline ou quando a conexão é restaurada
 */
export function ConnectivityIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-16 left-0 right-0 z-50 px-4 pt-4"
        >
          <Alert variant="destructive" className="max-w-2xl mx-auto shadow-lg">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>Sem conexão com a internet</AlertTitle>
            <AlertDescription>
              Você está offline. Algumas funcionalidades podem não estar disponíveis.
              Tentando reconectar automaticamente...
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
      
      {showReconnected && isOnline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-16 left-0 right-0 z-50 px-4 pt-4"
        >
          <Alert className="max-w-2xl mx-auto shadow-lg border-green-500 bg-green-50 dark:bg-green-950">
            <Wifi className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertTitle className="text-green-800 dark:text-green-200">Conexão restaurada</AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-300">
              Você está online novamente. Todas as funcionalidades foram restauradas.
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
