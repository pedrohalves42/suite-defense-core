import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { logger } from "@/lib/logger";

export function useCriticalInsights() {
  const { activeTenant, loading } = useActiveTenant(); // V-1045 FIX: Use standard tenant hook

  return useQuery({
    queryKey: ["critical-insights-count", activeTenant?.id],
    queryFn: async () => {
      if (!activeTenant?.id) return 0;
      
      // Count critical/high unacknowledged insights
      const { count, error } = await supabase
        .from("ai_insights")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", activeTenant.id)
        .eq("acknowledged", false)
        .in("severity", ["critical", "high"]);
      
      if (error) {
        console.error("Error fetching critical insights:", error);
        return 0;
      }
      
      return count || 0;
    },
    enabled: !loading && !!activeTenant?.id,
    refetchInterval: 300000,
    staleTime: 30000,
  });
}