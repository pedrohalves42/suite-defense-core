import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { logger } from "@/lib/logger";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "critical" | "warning" | "info";
  timestamp: Date;
  read: boolean;
}

/**
 * Hook for in-app notifications with Web Push support.
 * Monitors realtime events and generates alerts for critical conditions.
 */
export function useNotifications() {
  const { tenant } = useTenant();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const requestPushPermission = useCallback(async () => {
    if (!("Notification" in window)) return "denied" as NotificationPermission;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    return permission;
  }, []);

  const addNotification = useCallback((n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
    const notification: AppNotification = {
      ...n,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [notification, ...prev].slice(0, 50));

    // Send browser push if permitted
    if (pushPermission === "granted" && n.type === "critical") {
      try {
        new Notification(n.title, {
          body: n.message,
          icon: "/pwa-icon-192.png",
          tag: notification.id,
        });
      } catch (e) {
        logger.warn("[Notifications] Push failed", e);
      }
    }
  }, [pushPermission]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // Monitor critical events via realtime
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel(`notifications-${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const job = payload.new as Record<string, unknown>;
        if (job.status === "failed") {
          addNotification({
            title: "Verificação falhou",
            message: `Job ${job.type} falhou no agente ${job.agent_name}`,
            type: "critical",
          });
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'virus_scans',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const scan = payload.new as Record<string, unknown>;
        if (scan.is_malicious) {
          addNotification({
            title: "⚠️ Malware detectado",
            message: `Arquivo malicioso encontrado em ${scan.agent_name}: ${scan.file_path}`,
            type: "critical",
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, addNotification]);

  return {
    notifications,
    unreadCount,
    pushPermission,
    requestPushPermission,
    addNotification,
    markAsRead,
    markAllAsRead,
  };
}
