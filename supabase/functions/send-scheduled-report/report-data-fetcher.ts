/**
 * Fetch report data from database for a tenant.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface ScheduledReport {
  id: string;
  tenant_id: string;
  include_software_inventory: boolean;
  include_vulnerabilities: boolean;
  include_web_activity: boolean;
  include_antivirus: boolean;
  include_agents_summary: boolean;
}

export interface ReportData {
  agents: Array<Record<string, unknown>>;
  software: Array<Record<string, unknown>>;
  vulnerabilities: Array<Record<string, unknown>>;
  antivirus: Array<Record<string, unknown>>;
  webActivity: Array<Record<string, unknown>>;
  securityEvents: Array<Record<string, unknown>>;
}

export async function fetchReportData(
  supabase: SupabaseClient,
  tenantId: string,
  report: ScheduledReport,
): Promise<ReportData> {
  const [
    { data: agents },
    { data: software },
    { data: vulnerabilities },
    { data: antivirus },
    { data: webActivity },
    { data: securityEvents },
  ] = await Promise.all([
    report.include_agents_summary
      ? supabase
          .from('agents')
          .select('id, agent_name, hostname, os_type, status, last_heartbeat, agent_version')
          .eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),

    report.include_software_inventory
      ? supabase
          .from('software_inventory')
          .select('id, name, version, vendor, agent_id')
          .eq('tenant_id', tenantId)
          .limit(100)
      : Promise.resolve({ data: [] }),

    report.include_vulnerabilities
      ? supabase
          .from('vuln_findings')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('severity', { ascending: true })
      : Promise.resolve({ data: [] }),

    report.include_antivirus
      ? supabase
          .from('antivirus_status')
          .select('*')
          .eq('tenant_id', tenantId)
      : Promise.resolve({ data: [] }),

    report.include_web_activity
      ? supabase
          .from('agent_web_activity')
          .select('domain, category, is_blocked, visit_count')
          .eq('tenant_id', tenantId)
          .order('visit_count', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),

    supabase
      .from('security_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return {
    agents: agents || [],
    software: software || [],
    vulnerabilities: vulnerabilities || [],
    antivirus: antivirus || [],
    webActivity: webActivity || [],
    securityEvents: securityEvents || [],
  };
}
