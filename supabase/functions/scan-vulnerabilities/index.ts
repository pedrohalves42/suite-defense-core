import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SoftwareItem {
  name: string;
  version: string;
  vendor: string | null;
}

interface CVE {
  id: string;
  summary: string;
  cvss_score: number;
  severity: string;
  published_date: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { agent_id, tenant_id } = await req.json();

    if (!agent_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'agent_id and tenant_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SCAN-VULNS] Starting vulnerability scan for agent ${agent_id}`);

    // 1. Get software inventory for this agent
    const { data: software, error: softwareError } = await supabase
      .from('software_inventory')
      .select('name, version, vendor')
      .eq('agent_id', agent_id)
      .limit(100); // Limit to prevent overloading

    if (softwareError) {
      console.error('[SCAN-VULNS] Error fetching software:', softwareError);
      throw softwareError;
    }

    if (!software || software.length === 0) {
      console.log('[SCAN-VULNS] No software inventory found for agent');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No software inventory to scan',
          vulnerabilities_found: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[SCAN-VULNS] Found ${software.length} software items to scan`);

    // 2. Search for vulnerabilities using NVD API (simulated)
    // In production, this would query https://services.nvd.nist.gov/rest/json/cves/2.0
    // For now, we'll implement a simplified version with common CVEs
    
    const vulnerabilities: any[] = [];
    const knownVulnerableSoftware = getKnownVulnerabilities();

    for (const item of software as SoftwareItem[]) {
      const softwareName = item.name?.toLowerCase() || '';
      const version = item.version || '';

      // Check against known vulnerabilities
      const vulns = knownVulnerableSoftware.filter(kv => {
        const matchesName = softwareName.includes(kv.software.toLowerCase());
        const matchesVersion = version.includes(kv.affectedVersion) || 
                              compareVersions(version, kv.affectedVersion) <= 0;
        return matchesName && matchesVersion;
      });

      for (const vuln of vulns) {
        vulnerabilities.push({
          agent_id,
          tenant_id,
          cve_id: vuln.cve_id,
          title: vuln.title,
          description: vuln.description,
          severity: vuln.severity,
          cvss_score: vuln.cvss_score,
          affected_software: item.name,
          affected_version: item.version,
          fix_available: vuln.fix_available,
          remediation: vuln.remediation,
          discovered_at: new Date().toISOString(),
          acknowledged: false,
          metadata: {
            vendor: item.vendor,
            detection_method: 'software_inventory_match',
            nvd_link: `https://nvd.nist.gov/vuln/detail/${vuln.cve_id}`
          }
        });
      }
    }

    console.log(`[SCAN-VULNS] Found ${vulnerabilities.length} vulnerabilities`);

    // 3. Store findings in database
    if (vulnerabilities.length > 0) {
      // Delete old findings for this agent to avoid duplicates
      await supabase
        .from('vuln_findings')
        .delete()
        .eq('agent_id', agent_id);

      const { error: insertError } = await supabase
        .from('vuln_findings')
        .insert(vulnerabilities);

      if (insertError) {
        console.error('[SCAN-VULNS] Error inserting vulnerabilities:', insertError);
        throw insertError;
      }

      console.log(`[SCAN-VULNS] Successfully stored ${vulnerabilities.length} vulnerability findings`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        vulnerabilities_found: vulnerabilities.length,
        software_scanned: software.length,
        critical_vulns: vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high_vulns: vulnerabilities.filter(v => v.severity === 'HIGH').length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[SCAN-VULNS] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getKnownVulnerabilities() {
  // Common CVEs for demonstration
  // In production, this would query NVD API or a local vulnerability database
  return [
    {
      cve_id: 'CVE-2024-21762',
      software: 'Chrome',
      affectedVersion: '120',
      title: 'Google Chrome Use After Free Vulnerability',
      description: 'Use after free vulnerability in V8 in Google Chrome prior to 120.0.6099.129',
      severity: 'HIGH',
      cvss_score: 8.8,
      fix_available: true,
      remediation: 'Update to Chrome version 120.0.6099.129 or later'
    },
    {
      cve_id: 'CVE-2024-20672',
      software: 'Firefox',
      affectedVersion: '120',
      title: 'Mozilla Firefox Memory Corruption',
      description: 'Memory corruption vulnerability in Firefox ESR and Firefox',
      severity: 'HIGH',
      cvss_score: 8.6,
      fix_available: true,
      remediation: 'Update to Firefox 121.0 or later'
    },
    {
      cve_id: 'CVE-2023-36884',
      software: 'Office',
      affectedVersion: '2019',
      title: 'Microsoft Office Remote Code Execution',
      description: 'Windows Search Remote Code Execution Vulnerability affecting Office',
      severity: 'CRITICAL',
      cvss_score: 9.8,
      fix_available: true,
      remediation: 'Apply Microsoft security updates for Office 2019'
    },
    {
      cve_id: 'CVE-2023-21709',
      software: 'Windows',
      affectedVersion: '10',
      title: 'Windows Common Log File System Driver Elevation of Privilege',
      description: 'Elevation of privilege vulnerability in Windows Common Log File System Driver',
      severity: 'HIGH',
      cvss_score: 7.8,
      fix_available: true,
      remediation: 'Install Windows Update KB5022845 or later'
    },
    {
      cve_id: 'CVE-2024-21413',
      software: 'Outlook',
      affectedVersion: '2016',
      title: 'Microsoft Outlook Remote Code Execution',
      description: 'Remote Code Execution vulnerability in Microsoft Outlook',
      severity: 'CRITICAL',
      cvss_score: 9.8,
      fix_available: true,
      remediation: 'Update to latest Outlook version with February 2024 patches'
    },
    {
      cve_id: 'CVE-2023-38545',
      software: 'curl',
      affectedVersion: '8.3',
      title: 'Curl SOCKS5 Heap Buffer Overflow',
      description: 'Heap buffer overflow in SOCKS5 proxy handshake',
      severity: 'HIGH',
      cvss_score: 7.5,
      fix_available: true,
      remediation: 'Update curl to version 8.4.0 or later'
    }
  ];
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(n => parseInt(n) || 0);
  const parts2 = v2.split('.').map(n => parseInt(n) || 0);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}
