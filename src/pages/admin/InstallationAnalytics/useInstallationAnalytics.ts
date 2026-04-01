import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useInstallationAnalytics() {
  const { toast } = useToast();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['installation-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installation_analytics')
        .select('id, agent_name, event_type, platform, success, installation_method, installation_time_seconds, error_message, created_at, tenant_id')
        .order('created_at', { ascending: false });
      if (error) {
        toast({ title: "Erro ao carregar analytics", description: error.message, variant: "destructive" });
        throw error;
      }
      return data;
    }
  });

  const metrics = {
    total_generated: analytics?.filter(a => a.event_type === 'generated').length || 0,
    total_downloaded: analytics?.filter(a => a.event_type === 'downloaded').length || 0,
    total_copied: analytics?.filter(a => a.event_type === 'command_copied').length || 0,
    total_installed: analytics?.filter(a =>
      a.event_type === 'post_installation' || a.event_type === 'post_installation_unverified'
    ).length || 0,
    total_failed: analytics?.filter(a => a.event_type === 'failed').length || 0,
  };

  const conversionRate = metrics.total_generated > 0
    ? ((metrics.total_installed / metrics.total_generated) * 100).toFixed(1) : '0';

  const installEvents = analytics?.filter(a =>
    (a.event_type === 'post_installation' || a.event_type === 'post_installation_unverified') && a.installation_time_seconds
  ) || [];
  const avgInstallTime = installEvents.length > 0
    ? installEvents.reduce((acc, curr) => acc + (curr.installation_time_seconds || 0), 0) / installEvents.length
    : 0;

  const platformData = [
    { name: 'Windows', value: analytics?.filter(a => a.platform === 'windows').length || 0 },
    { name: 'Linux', value: analytics?.filter(a => a.platform === 'linux').length || 0 },
  ];

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
  const eventData = [
    { name: 'Gerados', value: metrics.total_generated, color: COLORS[1] },
    { name: 'Baixados', value: metrics.total_downloaded, color: COLORS[2] },
    { name: 'Instalados', value: metrics.total_installed, color: COLORS[0] },
    { name: 'Falhados', value: metrics.total_failed, color: COLORS[3] },
  ];

  const timelineData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split('T')[0];
    return {
      date: dateStr,
      generated: analytics?.filter(a => a.created_at.startsWith(dateStr) && a.event_type === 'generated').length || 0,
      installed: analytics?.filter(a => a.created_at.startsWith(dateStr) && (a.event_type === 'post_installation' || a.event_type === 'post_installation_unverified')).length || 0,
      failed: analytics?.filter(a => a.created_at.startsWith(dateStr) && a.event_type === 'failed').length || 0,
    };
  });

  return {
    isLoading, metrics, conversionRate, avgInstallTime,
    platformData, eventData, timelineData, COLORS, installEvents,
  };
}
