import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTenant } from "@/hooks/useTenant";

export interface DashboardAgent {
  id: string;
  agent_name: string;
  status: string;
  enrolled_at: string;
  last_heartbeat: string | null;
  tenant_id: string;
}

export interface DashboardJob {
  id: string;
  agent_name: string;
  type: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message?: string | null;
  failure_class?: string | null;
}

export interface DashboardReport {
  id: string;
  agent_name: string;
  kind: string;
  file_path: string;
  created_at: string;
}

export interface DashboardAgentToken {
  id: string;
  agent_id: string;
  token_hash: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  agents?: { agent_name: string } | null;
}

export interface DashboardRateLimit {
  id: string;
  identifier: string;
  endpoint: string;
  request_count: number;
  window_start: string;
  last_request_at: string;
  blocked_until: string | null;
}

export interface DashboardVirusScan {
  id: string;
  agent_name: string;
  file_path: string;
  file_hash: string;
  is_malicious: boolean | null;
  positives: number | null;
  total_scans: number | null;
  scanned_at: string;
}

export interface DashboardAuditLog {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
  success: boolean;
  user_id: string | null;
}

export function useDashboardData() {
  const { isOnline } = useOnlineStatus();
  const { tenant, loading: tenantLoading } = useTenant();
  const [agents, setAgents] = useState<DashboardAgent[]>([]);
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [reports, setReports] = useState<DashboardReport[]>([]);
  const [agentTokens, setAgentTokens] = useState<DashboardAgentToken[]>([]);
  const [rateLimits, setRateLimits] = useState<DashboardRateLimit[]>([]);
  const [virusScans, setVirusScans] = useState<DashboardVirusScan[]>([]);
  const [auditLogs, setAuditLogs] = useState<DashboardAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadTenantNames = async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name');
      if (!error && data) {
        const map: Record<string, string> = {};
        data.forEach(t => map[t.id] = t.name);
        setTenantNames(map);
      }
    };
    loadTenantNames();
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }

    try {
      const [agentsRes, jobsRes, reportsRes, tokensRes, rateLimitsRes, scansRes, logsRes] = await Promise.all([
        supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: false }),
        supabase.from("jobs").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("reports").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("agent_tokens" as any).select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
        (supabase.from("rate_limits") as any).select("*").eq("tenant_id", tenant.id).order("last_request_at", { ascending: false }).limit(100),
        supabase.from("virus_scans").select("*").eq("tenant_id", tenant.id).order("scanned_at", { ascending: false }).limit(100),
        supabase.from("audit_logs").select("id, action, resource_type, created_at, success, user_id").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(50),
      ]);

      if (agentsRes.data) {
        const mappedAgents: DashboardAgent[] = ((agentsRes.data || []) as any[]).map((agent) => ({
          id: agent.id,
          agent_name: agent.agent_name,
          status: agent.status,
          enrolled_at: agent.enrolled_at,
          last_heartbeat: agent.last_heartbeat,
          tenant_id: agent.tenant_id,
        }));
        setAgents(mappedAgents);
      }
      if (jobsRes.data) setJobs(jobsRes.data);
      if (reportsRes.data) setReports(reportsRes.data);
      if (tokensRes.data) setAgentTokens(tokensRes.data as unknown as DashboardAgentToken[]);
      if (rateLimitsRes.data) setRateLimits(rateLimitsRes.data);
      if (scansRes.data) setVirusScans(scansRes.data);
      if (logsRes.data) setAuditLogs(logsRes.data);
    } catch (error) {
      logger.error("Erro ao carregar dados", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant?.id) return;
    
    loadDashboardData();
    
    const interval = setInterval(() => {
      if (isOnline) {
        loadDashboardData();
      } else {
        logger.info('[ServerDashboard] Pausing polling - offline');
      }
    }, 10000);
    
    const agentsChannel = supabase
      .channel(`agents-changes-${tenant.id}`)
      .on('postgres_changes', { 
        event: '*', schema: 'public', table: 'agents',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => loadDashboardData())
      .subscribe();

    const jobsChannel = supabase
      .channel(`jobs-changes-${tenant.id}`)
      .on('postgres_changes', { 
        event: '*', schema: 'public', table: 'jobs',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => loadDashboardData())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [tenant?.id, isOnline, loadDashboardData]);

  return {
    agents, jobs, reports, agentTokens, rateLimits, virusScans, auditLogs,
    loading, tenant, tenantLoading, tenantNames, refresh: loadDashboardData,
  };
}
