import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCriticalInsights() {
  return useQuery({
    queryKey: ["critical-insights-count"],
    queryFn: async () => {
      // Get user's tenant first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      
      if (!userRole?.tenant_id) return 0;
      
      // Count critical/high unacknowledged insights
      const { count, error } = await supabase
        .from("ai_insights")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", userRole.tenant_id)
        .eq("acknowledged", false)
        .in("severity", ["critical", "high"]);
      
      if (error) {
        console.error("Error fetching critical insights:", error);
        return 0;
      }
      
      return count || 0;
    },
    refetchInterval: 300000, // COST-OPT: 60s → 5min
    staleTime: 30000,
  });
}
