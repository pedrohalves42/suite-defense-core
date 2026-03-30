import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePitchMetrics() {
  return useQuery({
    queryKey: ['pitch-metrics'],
    queryFn: async () => {
      const [tenants, agents, jobs, subscriptions] = await Promise.all([
        supabase.from('tenants').select('id, created_at'),
        supabase.from('agents_safe').select('id, status'),
        supabase.from('jobs').select('id, status'),
        supabase.from('tenant_subscriptions').select('id, status, device_quantity, plan_id, subscription_plans(price)'),
      ]);

      const activeAgents = agents.data?.filter(a => a.status === 'active').length || 0;
      const completedJobs = jobs.data?.filter(j => j.status === 'completed').length || 0;
      const totalJobs = jobs.data?.length || 0;
      const successRate = totalJobs > 0 ? (completedJobs / totalJobs * 100) : 0;
      const activeSubs = subscriptions.data?.filter(s => s.status === 'active' || s.status === 'trialing') || [];
      const mrr = activeSubs.reduce((sum, s) => {
        const price = (s.subscription_plans as any)?.price || 0;
        return sum + (price * (s.device_quantity || 1));
      }, 0);

      return {
        totalTenants: tenants.data?.length || 0,
        totalAgents: agents.data?.length || 0,
        activeAgents,
        totalJobs,
        successRate: successRate.toFixed(1),
        activeSubs: activeSubs.length,
        mrr,
      };
    },
  });
}
