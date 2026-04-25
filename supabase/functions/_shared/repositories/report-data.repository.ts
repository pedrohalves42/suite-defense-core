
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export class ReportDataRepository {
  constructor(private supabase: SupabaseClient) {}

  async getComplianceData(tenantId: string, periodStart: string, periodEnd: string) {
    const [
      { data: tenantRow },
      { data: agentsData },
      { data: vulns },
      { data: avData },
      { count: eventCount },
      { data: securityEvents },
      { count: auditCount },
      { data: blockedSites },
      { count: blockedAccessCount },
      { data: recentJobs },
      { count: outdatedSoftwareCount },
      { data: prevRiskScore },
    ] = await Promise.all([
      this.supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
      this.supabase.from("agents").select("id, agent_name, status, last_heartbeat, agent_version, os_type").eq("tenant_id", tenantId),
      this.supabase.from("vuln_findings").select("severity, title, cve_id, status").eq("tenant_id", tenantId),
      this.supabase.from("antivirus_status").select("real_time_protection, threats_found, definition_status").eq("tenant_id", tenantId),
      this.supabase.from("agent_evidence_logs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", periodStart),
      this.supabase.from("security_events").select("severity, event_type").eq("tenant_id", tenantId).gte("created_at", periodStart),
      this.supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", periodStart),
      this.supabase.from("blocked_websites").select("id, domain, reason, is_active, created_at").eq("tenant_id", tenantId).eq("is_active", true),
      this.supabase.from("agent_web_activity").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_blocked", true).gte("visited_at", periodStart),
      this.supabase.from("jobs").select("status").eq("tenant_id", tenantId).gte("created_at", periodStart),
      this.supabase.from("installed_software").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("needs_update", true),
      this.supabase.from("tenant_risk_scores").select("score").eq("tenant_id", tenantId).order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return {
      tenantRow,
      agentsData,
      vulns,
      avData,
      eventCount,
      securityEvents,
      auditCount,
      blockedSites,
      blockedAccessCount,
      recentJobs,
      outdatedSoftwareCount,
      prevRiskScore
    };
  }
}
