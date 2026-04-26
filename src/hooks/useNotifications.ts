import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { logger } from "@/lib/logger";
import { realtimeChannelManager } from "@/lib/realtime-manager";

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
 * Reuses channels via RealtimeChannelManager.
 */
export function useNotifications() {
  const { tenant } = useTenant();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const instanceId = useRef(`notif-${Math.random().toString(36).substring(2, 9)}`).current;

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
          icon: "/favicon.ico",
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

  // Monitor critical events via realtime manager
  useEffect(() => {
    if (!tenant?.id) return;

    logger.debug('[useNotifications] Setting up realtime subscriptions via manager');

    // Subscribe to Jobs
    realtimeChannelManager.subscribe(
      `${instanceId}-jobs`,
      'jobs',
      `tenant_id=eq.${tenant.id}`,
      (payload) => {
        const job = payload.new as Record<string, unknown>;
        if (job.status === "failed") {
          addNotification({
            title: payload.eventType === 'INSERT' ? "Verificação falhou" : "⚠️ Job falhou",
            message: `${job.type} falhou no agente ${job.agent_name}`,
            type: payload.eventType === 'INSERT' ? "critical" : "warning",
          });
        }
      }
    );

    // Subscribe to Virus Scans
    realtimeChannelManager.subscribe(
      `${instanceId}-scans`,
      'virus_scans',
      `tenant_id=eq.${tenant.id}`,
      (payload) => {
        if (payload.eventType !== 'INSERT') return;
        const scan = payload.new as Record<string, unknown>;
        if (scan.is_malicious) {
          addNotification({
            title: "⚠️ Malware detectado",
            message: `Arquivo malicioso encontrado em ${scan.agent_name}: ${scan.file_path}`,
            type: "critical",
          });
        }
      }
    );

    // Subscribe to Agents
    realtimeChannelManager.subscribe(
      `${instanceId}-agents`,
      'agents',
      `tenant_id=eq.${tenant.id}`,
      (payload) => {
        if (payload.eventType !== 'UPDATE') return;
        const oldAgent = payload.old as Record<string, unknown>;
        const newAgent = payload.new as Record<string, unknown>;
        
        // Detect version change
        if (oldAgent.agent_version && newAgent.agent_version && oldAgent.agent_version !== newAgent.agent_version) {
          addNotification({
            title: "🔄 Agente atualizado",
            message: `${newAgent.agent_name} atualizado de ${oldAgent.agent_version} para ${newAgent.agent_version}`,
            type: "info",
          });
        }
        
        // Detect isolation
        if (!oldAgent.is_isolated && newAgent.is_isolated) {
          addNotification({
            title: "🔒 Agente isolado",
            message: `${newAgent.agent_name} foi isolado da rede`,
            type: "critical",
          });
        }
      }
    );

    return () => {
      logger.debug('[useNotifications] Cleaning up realtime subscriptions');
      realtimeChannelManager.unsubscribe(`${instanceId}-jobs`, 'jobs', `tenant_id=eq.${tenant.id}`);
      realtimeChannelManager.unsubscribe(`${instanceId}-scans`, 'virus_scans', `tenant_id=eq.${tenant.id}`);
      realtimeChannelManager.unsubscribe(`${instanceId}-agents`, 'agents', `tenant_id=eq.${tenant.id}`);
    };
  }, [tenant?.id, addNotification, instanceId]);

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
