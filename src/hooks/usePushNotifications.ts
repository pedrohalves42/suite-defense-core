import { useEffect, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const supported = 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      logger.debug('[PushNotifications] Not supported in this browser');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch (error) {
      logger.error('[PushNotifications] Permission request failed:', error);
      return false;
    }
  }, []);

  const showNotification = useCallback((options: PushNotificationOptions) => {
    if (permission !== 'granted') return;

    // Use service worker if available for better PWA integration
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(options.title, {
          body: options.body,
          icon: options.icon || '/pwa-icon-192.png',
          badge: options.badge || '/pwa-icon-192.png',
          tag: options.tag || 'cybershield-notification',
          data: options.data,
          ...(('vibrate' in Notification.prototype) ? { vibrate: [200, 100, 200] } : {}),
        });
      });
    } else {
      // Fallback to regular Notification API
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/pwa-icon-192.png',
        tag: options.tag || 'cybershield-notification',
      });
    }
  }, [permission]);

  const dismiss = useCallback(() => {
    setPermission(Notification.permission);
  }, []);

  return {
    permission,
    isSupported,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    isDefault: permission === 'default',
    requestPermission,
    showNotification,
    dismiss,
  };
};
