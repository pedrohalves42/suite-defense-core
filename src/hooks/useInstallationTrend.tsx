import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface TrendDataPoint {
  date: string;
  total: number;
  successful: number;
  failed: number;
  successRate: number;
}

export function useInstallationTrend(days: number = 7) {
  const adaptiveInterval = useAdaptivePolling(300000);
  return useQuery({
    queryKey: ['installation-trend', days],
    queryFn: async (): Promise<TrendDataPoint[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data, error } = await supabase
        .from('installation_analytics')
        .select('created_at, success')
        .gte('created_at', startDate.toISOString())
        .in('event_type', ['post_installation', 'post_installation_unverified']);
      
      if (error) throw error;
      
      // Agrupar por dia
      const grouped = new Map<string, { total: number; successful: number; failed: number }>();
      
      // Inicializar todos os dias
      for (let i = 0; i < days; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        grouped.set(dateKey, { total: 0, successful: 0, failed: 0 });
      }
      
      // Processar dados
      (data || []).forEach(item => {
        const dateKey = item.created_at.split('T')[0];
        const existing = grouped.get(dateKey);
        if (existing) {
          existing.total += 1;
          if (item.success) {
            existing.successful += 1;
          } else {
            existing.failed += 1;
          }
        }
      });
      
      // Converter para array ordenado
      const result: TrendDataPoint[] = [];
      grouped.forEach((value, key) => {
        result.push({
          date: key,
          total: value.total,
          successful: value.successful,
          failed: value.failed,
          successRate: value.total > 0 ? Math.round((value.successful / value.total) * 100) : 0
        });
      });
      
      return result.sort((a, b) => a.date.localeCompare(b.date));
    },
    refetchInterval: adaptiveInterval,
    staleTime: 120000, // 2 minutes
  });
}
