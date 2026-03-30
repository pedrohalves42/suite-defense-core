import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { logger } from "@/lib/logger";
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';

export function useCriticalInsights() {
  const { activeTenant, loading } = useActiveTenant();

  return useRealtimeQuery({
    queryKey: ["critical-insights-count", activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return 0;
      
      const { count, error } = await supabase
        .from("ai_insights")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", activeTenant.id)
        .eq("acknowledged", false)
        .in("severity", ["critical", "high"]);
      
      if (error) {
        logger.error("Error fetching critical insights", error);
        return 0;
      }
      
      return count || 0;
    },
    enabled: !loading && !!activeTenant?.id,
    realtimeTable: 'ai_insights',
    realtimeFilter: `tenant_id=eq.${activeTenant?.id}`,
    staleTime: 300_000,
  });
}