import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import type {
  NotificationChannel,
  NotificationPreference,
  NotificationLog,
  ScheduledReport,
  ChannelType,
} from './types';

export interface NewChannelState {
  type: ChannelType;
  name: string;
  config: Record<string, string>;
}

export interface NewReportState {
  name: string;
  schedule: string;
  day_of_week: number;
  hour: number;
  recipients: string[];
  include_software_inventory: boolean;
  include_vulnerabilities: boolean;
  include_web_activity: boolean;
  include_antivirus: boolean;
  include_agents_summary: boolean;
}

const DEFAULT_NEW_REPORT: NewReportState = {
  name: 'Relatório Semanal de Segurança',
  schedule: 'weekly',
  day_of_week: 1,
  hour: 9,
  recipients: [],
  include_software_inventory: true,
  include_vulnerabilities: true,
  include_web_activity: true,
  include_antivirus: true,
  include_agents_summary: true,
};

export function useNotificationSettings() {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: tenantLoading, isFetched } = useActiveTenant();
  const tenantId = activeTenant?.id || null;

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingReport, setSendingReport] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    try {
      const [channelsRes, logsRes, reportsRes] = await Promise.all([
        supabase
          .from('notification_channels')
          .select('id, tenant_id, channel_type, name, config, is_active, is_verified, verified_at, created_at, updated_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('notification_log')
          .select('id, tenant_id, channel_id, channel_type, recipient, message_preview, status, error_message, sent_at, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('scheduled_reports')
          .select('id, tenant_id, name, report_type, schedule, recipients, is_active, last_sent_at, next_send_at, created_at, created_by, hour, day_of_week, timezone, include_agents_summary, include_antivirus, include_software_inventory, include_vulnerabilities, include_web_activity')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
      ]);

      if (channelsRes.data) {
        setChannels(channelsRes.data.map(c => ({ ...c, config: (c.config ?? {}) as Record<string, unknown> })));

        const channelIds = channelsRes.data.map(c => c.id);
        if (channelIds.length > 0) {
          const { data: prefsData } = await supabase
            .from('notification_preferences')
            .select('id, channel_id, alert_types, severity_filter, enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, tenant_id, created_at, updated_at')
            .in('channel_id', channelIds);
          if (prefsData) setPreferences(prefsData);
        }
      }
      if (logsRes.data) setLogs(logsRes.data);
      if (reportsRes.data) setScheduledReports(reportsRes.data as ScheduledReport[]);
    } catch (error) {
      logger.error('Error fetching data:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const handleAddChannel = useCallback(async (newChannel: NewChannelState) => {
    if (!tenantId || !newChannel.name) {
      toast.error('Preencha todos os campos');
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('notification_channels')
        .insert({
          tenant_id: tenantId,
          channel_type: newChannel.type,
          name: newChannel.name,
          config: newChannel.config,
          is_verified: newChannel.type === 'email',
          is_active: true
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('notification_preferences').insert({
        tenant_id: tenantId,
        channel_id: data.id,
        alert_types: [],
        severity_filter: ['critical', 'high'],
        enabled: true
      });

      toast.success('Canal adicionado com sucesso!');
      fetchData();
      return true;
    } catch (error) {
      logger.error('Error adding channel:', error);
      toast.error('Erro ao adicionar canal');
      return false;
    }
  }, [tenantId, fetchData]);

  const handleDeleteChannel = useCallback(async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este canal?')) return;
    try {
      const { error } = await supabase
        .from('notification_channels')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      toast.success('Canal removido');
      fetchData();
    } catch (error) {
      logger.error('Error deleting channel:', error);
      toast.error('Erro ao remover canal');
    }
  }, [tenantId, fetchData]);

  const handleToggleChannel = useCallback(async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('notification_channels')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      setChannels(prev => prev.map(c => c.id === id ? { ...c, is_active: isActive } : c));
      toast.success(isActive ? 'Canal ativado' : 'Canal desativado');
    } catch (error) {
      logger.error('Error toggling channel:', error);
      toast.error('Erro ao atualizar canal');
    }
  }, [tenantId]);

  const handleUpdatePreferences = useCallback(async (channelId: string, updates: Partial<NotificationPreference>) => {
    try {
      const existing = preferences.find(p => p.channel_id === channelId);
      if (existing) {
        const { error } = await supabase
          .from('notification_preferences')
          .update(updates)
          .eq('id', existing.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('notification_preferences')
          .insert({ tenant_id: tenantId, channel_id: channelId, ...updates });
        if (error) throw error;
      }
      fetchData();
      toast.success('Preferências salvas');
    } catch (error) {
      logger.error('Error updating preferences:', error);
      toast.error('Erro ao salvar preferências');
    }
  }, [tenantId, preferences, fetchData]);

  const handleTestNotification = useCallback(async (channel: NotificationChannel) => {
    try {
      toast.info('Enviando notificação de teste...');
      const { error } = await supabase.functions.invoke('ops-router', {
        body: {
          action: 'notify:dispatch',
          payload: {
            tenant_id: tenantId,
            alert_type: 'test',
            severity: 'info',
            title: 'Teste de Notificação',
            message: 'Esta é uma notificação de teste do CyberShield.',
            agent_name: 'Sistema'
          }
        }
      });
      if (error) throw error;
      toast.success('Notificação de teste enviada!');
      fetchData();
    } catch (error) {
      logger.error('Error sending test:', error);
      toast.error('Erro ao enviar teste');
    }
  }, [tenantId, fetchData]);

  const handleAddReport = useCallback(async (newReport: NewReportState) => {
    if (!tenantId) return false;
    if (newReport.recipients.length === 0) {
      toast.error('Adicione pelo menos um destinatário');
      return false;
    }
    try {
      const now = new Date();
      const nextSend = new Date(now);
      nextSend.setHours(newReport.hour + 3, 0, 0, 0);
      if (newReport.schedule === 'weekly') {
        const currentDay = now.getDay();
        let daysUntil = newReport.day_of_week - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        nextSend.setDate(nextSend.getDate() + daysUntil);
      } else if (nextSend <= now) {
        nextSend.setDate(nextSend.getDate() + 1);
      }
      const { error } = await supabase.from('scheduled_reports').insert({
        tenant_id: tenantId,
        ...newReport,
        next_send_at: nextSend.toISOString(),
        is_active: true,
        created_by: user?.id
      });
      if (error) throw error;
      toast.success('Relatório agendado com sucesso!');
      fetchData();
      return true;
    } catch (error) {
      logger.error('Error adding report:', error);
      toast.error('Erro ao criar relatório');
      return false;
    }
  }, [tenantId, user?.id, fetchData]);

  const handleDeleteReport = useCallback(async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este relatório?')) return;
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      toast.success('Relatório removido');
      fetchData();
    } catch (error) {
      logger.error('Error deleting report:', error);
      toast.error('Erro ao remover relatório');
    }
  }, [tenantId, fetchData]);

  const handleToggleReport = useCallback(async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduled_reports')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      setScheduledReports(prev => prev.map(r => r.id === id ? { ...r, is_active: isActive } : r));
      toast.success(isActive ? 'Relatório ativado' : 'Relatório desativado');
    } catch (error) {
      logger.error('Error toggling report:', error);
      toast.error('Erro ao atualizar relatório');
    }
  }, [tenantId]);

  const handleSendReportNow = useCallback(async (report: ScheduledReport) => {
    setSendingReport(report.id);
    try {
      toast.info('Enviando relatório...');
      const { error } = await supabase.functions.invoke('ops-router', {
        body: { action: 'notify:scheduled-report', payload: { report_id: report.id, tenant_id: tenantId } }
      });
      if (error) throw error;
      toast.success('Relatório enviado com sucesso!');
      fetchData();
    } catch (error) {
      logger.error('Error sending report:', error);
      toast.error('Erro ao enviar relatório');
    } finally {
      setSendingReport(null);
    }
  }, [tenantId, fetchData]);

  return {
    user,
    authLoading,
    tenantId,
    tenantLoading,
    isFetched,
    channels,
    preferences,
    logs,
    scheduledReports,
    loading,
    sendingReport,
    fetchData,
    handleAddChannel,
    handleDeleteChannel,
    handleToggleChannel,
    handleUpdatePreferences,
    handleTestNotification,
    handleAddReport,
    handleDeleteReport,
    handleToggleReport,
    handleSendReportNow,
    DEFAULT_NEW_REPORT,
  };
}
