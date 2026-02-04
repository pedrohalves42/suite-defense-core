import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAStatus {
  isInstalled: boolean;
  isInstallable: boolean;
  isOnline: boolean;
  isUpdateAvailable: boolean;
  platform: 'ios' | 'android' | 'desktop' | 'unknown';
}

export const usePWA = () => {
  const [status, setStatus] = useState<PWAStatus>({
    isInstalled: false,
    isInstallable: false,
    isOnline: navigator.onLine,
    isUpdateAvailable: false,
    platform: 'unknown'
  });
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const detectPlatform = useCallback((): 'ios' | 'android' | 'desktop' | 'unknown' => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /android/.test(userAgent);
    
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'desktop';
  }, []);

  const checkIfInstalled = useCallback(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebAppiOS = (navigator as any).standalone === true;
    return isStandalone || isInWebAppiOS;
  }, []);

  useEffect(() => {
    console.log('[usePWA] Initializing PWA status...');
    
    // Set initial status
    setStatus(prev => ({
      ...prev,
      isInstalled: checkIfInstalled(),
      platform: detectPlatform()
    }));

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[usePWA] beforeinstallprompt event received');
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setStatus(prev => ({ ...prev, isInstallable: true }));
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      console.log('[usePWA] App installed event received');
      setStatus(prev => ({ ...prev, isInstalled: true, isInstallable: false }));
      setDeferredPrompt(null);
    };

    // Listen for online/offline
    const handleOnline = () => {
      console.log('[usePWA] Online event');
      setStatus(prev => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      console.log('[usePWA] Offline event');
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.addEventListener('updatefound', () => {
          console.log('[usePWA] Service worker update found');
          setStatus(prev => ({ ...prev, isUpdateAvailable: true }));
        });
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkIfInstalled, detectPlatform]);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      console.log('[usePWA] No deferred prompt available');
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        console.log('[usePWA] User accepted installation');
        setStatus(prev => ({ ...prev, isInstalled: true }));
        setDeferredPrompt(null);
        return true;
      } else {
        console.log('[usePWA] User dismissed installation');
        return false;
      }
    } catch (error) {
      console.error('[usePWA] Installation error:', error);
      return false;
    }
  };

  const update = async (): Promise<void> => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      }
    }
  };

  return {
    ...status,
    install,
    update,
    canInstall: status.isInstallable && !status.isInstalled
  };
};

export default usePWA;
