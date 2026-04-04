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

    // Use regular Notification API (PWA/SW removed)
    try {
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag || 'cybershield-notification',
      });
    } catch (err) {
      logger.error('[PushNotifications] Failed to show notification:', err);
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
