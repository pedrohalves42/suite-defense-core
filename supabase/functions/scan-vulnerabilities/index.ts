import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { validateCallerTenant } from '../_shared/validate-caller-tenant.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SoftwareItem {
  name: string;
  version: string;
  vendor: string | null;
}

interface CVEMatch {
  cve_id: string;
  description: string;
  cvss_score: number | null;
  severity: string;
  cvss_vector: string | null;
  affected_versions: object[];
  weaknesses: string[];
  cve_references: object[];
  published_date: string;
}

// Helper function to scan a single agent (used by batch mode)
async function scanAgentVulnerabilities(
  supabase: any,
  agent_id: string,
  tenant_id: string,
  requestId: string
): Promise<{ vulnerabilities_found: number }> {
  // Get software inventory for this agent
  const { data: software, error: softwareError } = await supabase
    .from('software_inventory')
    .select('name, version, vendor')
    .eq('agent_id', agent_id)
    .limit(200);

  if (softwareError || !software || software.length === 0) {
    return { vulnerabilities_found: 0 };
  }

  // Build keywords
  const softwareKeywords = new Set<string>();
  const softwareMap = new Map<string, SoftwareItem[]>();
  
  for (const item of software as SoftwareItem[]) {
    const name = item.name?.toLowerCase() || '';
    const keywords = extractKeywordsHelper(name);
    keywords.forEach(kw => {
      softwareKeywords.add(kw);
      if (!softwareMap.has(kw)) {
        softwareMap.set(kw, []);
      }
      softwareMap.get(kw)!.push(item);
    });
  }

  // Search CVEs
  const vulnerabilities: any[] = [];
  const processedCVEs = new Set<string>();

  for (const keyword of Array.from(softwareKeywords).slice(0, 20)) {
    const { data: cves } = await supabase
      .from('cve_database')
      .select('*')
      .or(`affected_products.cs.{${keyword}},description.ilike.%${keyword}%`)
      .gte('cvss_score', 4.0)
      .order('cvss_score', { ascending: false })
      .limit(30);

    if (cves && cves.length > 0) {
      for (const cve of cves) {
        if (processedCVEs.has(cve.cve_id)) continue;
        
        const matchedSoftware = softwareMap.get(keyword) || [];
        for (const sw of matchedSoftware) {
          if (isVersionAffectedHelper(sw.version, cve.affected_versions)) {
            processedCVEs.add(cve.cve_id);
            
              const now = new Date().toISOString();
              vulnerabilities.push({
                agent_id,
                tenant_id,
                check_key: cve.cve_id,
                title: `${cve.cve_id}: ${(cve.description || '').slice(0, 100)}...`,
                description: cve.description,
                severity: normalizeSeverity(cve.severity || getSeverityFromScoreHelper(cve.cvss_score)),
                remediation: `Update ${sw.name.split(/[\s\-_]/)[0]} to the latest version`,
                first_seen_at: now,
                last_seen_at: now
              });
            break;
          }
        }
      }
    }
  }

  // Store findings
  if (vulnerabilities.length > 0) {
    await supabase.from('vuln_findings').delete().eq('agent_id', agent_id);
    await supabase.from('vuln_findings').insert(vulnerabilities);
  }

  return { vulnerabilities_found: vulnerabilities.length };
}

// Helper functions for batch mode (duplicated to avoid scope issues)
function extractKeywordsHelper(name: string): string[] {
  const keywords: string[] = [];
  let lowerName = name.toLowerCase();
  lowerName = lowerName.replace(/\s+\d+(\.\d+)*\s*$/, '');
  lowerName = lowerName.replace(/\s+(x64|x86|64-bit|32-bit)\s*$/i, '');
  
  const knownProducts = [
    'chrome', 'firefox', 'edge', 'office', 'outlook', 'teams',
    'java', 'python', 'nodejs', 'windows', 'zoom', 'slack',
    'vlc', 'winrar', '7zip', 'git', 'vscode', 'mysql', 'postgresql',
    'docker', 'curl', 'openssl', 'teamviewer'
  ];
  
  for (const product of knownProducts) {
    if (lowerName.includes(product)) {
      keywords.push(product);
    }
  }
  
  if (keywords.length === 0) {
    const firstWord = lowerName.split(/[\s\-_\.]/)[0];
    if (firstWord && firstWord.length >= 3) {
      keywords.push(firstWord);
    }
  }
  
  return keywords;
}

function isVersionAffectedHelper(installedVersion: string, affectedVersions: any[]): boolean {
  if (!affectedVersions || affectedVersions.length === 0) return true;
  return true; // Simplified for batch mode
}

function getSeverityFromScoreHelper(score: number | null): string {
  if (score === null) return 'medium';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  return 'low';
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

  const requestId = crypto.randomUUID().slice(0, 8);
  
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { agent_id, tenant_id, mode } = body;

    // V-1015 FIX: Validate caller has access to requested tenant
    if (tenant_id) {
      const validation = await validateCallerTenant(req, supabase, tenant_id);
      if (!validation.authorized) {
        return new Response(
          JSON.stringify({ error: validation.error }),
          { status: validation.statusCode || 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ✅ BATCH MODE: Scan all agents for a tenant
    if (mode === 'batch_all_agents') {
      console.log(`[${requestId}] [SCAN-VULNS] Starting BATCH scan for tenant ${tenant_id || 'ALL'}`);
      
      // Get all active agents
      let query = supabase
        .from('agents')
        .select('id, tenant_id, agent_name')
        .eq('status', 'active');
      
      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }
      
      const { data: agents, error: agentsError } = await query.limit(100);
      
      if (agentsError) {
        console.error(`[${requestId}] [SCAN-VULNS] Error fetching agents:`, agentsError);
        throw agentsError;
      }
      
      if (!agents || agents.length === 0) {
        console.log(`[${requestId}] [SCAN-VULNS] No active agents found for batch scan`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'No active agents to scan',
            agents_scanned: 0,
            total_vulnerabilities: 0
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[${requestId}] [SCAN-VULNS] Batch scanning ${agents.length} agents`);
      
      let totalVulns = 0;
      let agentsScanned = 0;
      const results: { agent_id: string; agent_name: string; vulns_found: number }[] = [];
      
      // Process each agent (limited concurrency)
      for (const agent of agents) {
        try {
          const scanResult = await scanAgentVulnerabilities(
            supabase, 
            agent.id, 
            agent.tenant_id, 
            requestId
          );
          totalVulns += scanResult.vulnerabilities_found;
          agentsScanned++;
          results.push({
            agent_id: agent.id,
            agent_name: agent.agent_name,
            vulns_found: scanResult.vulnerabilities_found
          });
        } catch (agentError) {
          console.error(`[${requestId}] [SCAN-VULNS] Error scanning agent ${agent.id}:`, agentError);
        }
      }
      
      // Trigger playbooks for critical vulnerabilities found
      if (totalVulns > 0) {
        const criticalAgents = results.filter(r => r.vulns_found > 0);
        for (const agentResult of criticalAgents.slice(0, 5)) { // Limit to 5 to avoid flooding
          try {
            // Check if there are critical vulns for this agent
            const { data: criticalVulns } = await supabase
              .from('vuln_findings')
              .select('id, severity')
              .eq('agent_id', agentResult.agent_id)
              .eq('severity', 'CRITICAL')
              .limit(1);
            
            if (criticalVulns && criticalVulns.length > 0) {
              // Trigger playbook for critical vulnerability
              const { data: agent } = await supabase
                .from('agents')
                .select('tenant_id')
                .eq('id', agentResult.agent_id)
                .single();
              
              if (agent) {
                await supabase.functions.invoke('evaluate-playbook-triggers', {
                  body: {
                    tenant_id: agent.tenant_id,
                    trigger_type: 'vulnerability_critical',
                    agent_id: agentResult.agent_id,
                    context: {
                      vulns_found: agentResult.vulns_found,
                      agent_name: agentResult.agent_name
                    }
                  }
                });
                console.log(`[${requestId}] [SCAN-VULNS] Triggered playbook for agent ${agentResult.agent_name} with critical vulns`);
              }
            }
          } catch (triggerError) {
            console.error(`[${requestId}] [SCAN-VULNS] Error triggering playbook:`, triggerError);
          }
        }
      }
      
      console.log(`[${requestId}] [SCAN-VULNS] Batch scan complete: ${agentsScanned} agents, ${totalVulns} total vulnerabilities`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          mode: 'batch',
          agents_scanned: agentsScanned,
          total_vulnerabilities: totalVulns,
          results
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single agent scan (original behavior)

    if (!agent_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'agent_id and tenant_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] [SCAN-VULNS] Starting vulnerability scan for agent ${agent_id}`);

    // 1. Get software inventory for this agent
    const { data: software, error: softwareError } = await supabase
      .from('software_inventory')
      .select('name, version, vendor')
      .eq('agent_id', agent_id)
      .limit(200);

    if (softwareError) {
      console.error(`[${requestId}] [SCAN-VULNS] Error fetching software:`, softwareError);
      throw new Error(softwareError.message || 'Failed to fetch software inventory');
    }

    if (!software || software.length === 0) {
      console.log(`[${requestId}] [SCAN-VULNS] No software inventory found for agent`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No software inventory to scan',
          vulnerabilities_found: 0,
          scan_method: 'dynamic_nvd'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] [SCAN-VULNS] Found ${software.length} software items to scan`);

    // 2. Build list of unique software keywords to search
    const softwareKeywords = new Set<string>();
    const softwareMap = new Map<string, SoftwareItem[]>();
    
    for (const item of software as SoftwareItem[]) {
      const name = item.name?.toLowerCase() || '';
      
      // Extract base product name for searching
      const keywords = extractKeywords(name);
      keywords.forEach(kw => {
        softwareKeywords.add(kw);
        if (!softwareMap.has(kw)) {
          softwareMap.set(kw, []);
        }
        softwareMap.get(kw)!.push(item);
      });
    }

    console.log(`[${requestId}] [SCAN-VULNS] Extracted ${softwareKeywords.size} unique keywords to search`);

    // 3. Search for CVEs in database (already cached from NVD)
    const vulnerabilities: any[] = [];
    const processedCVEs = new Set<string>();

    // First, try to find matches in our CVE database cache
    for (const keyword of Array.from(softwareKeywords).slice(0, 30)) { // Increased to 30 keywords
      // FASE 3: Melhorar query de CVE matching com ILIKE mais flexível
      const { data: cves, error: cveError } = await supabase
        .from('cve_database')
        .select('*')
        .or(`affected_products.cs.{${keyword}},description.ilike.%${keyword}%,cpe_matches.cs.{${keyword}}`)
        .gte('cvss_score', 4.0) // Only medium+ severity
        .order('cvss_score', { ascending: false })
        .limit(50);

      if (cveError) {
        console.log(`[${requestId}] [SCAN-VULNS] Error searching CVEs for "${keyword}":`, cveError.message);
        continue;
      }

      if (cves && cves.length > 0) {
        console.log(`[${requestId}] [SCAN-VULNS] Found ${cves.length} CVEs for keyword "${keyword}"`);
        
        // Match CVEs to installed software
        for (const cve of cves) {
          if (processedCVEs.has(cve.cve_id)) continue;
          
          const matchedSoftware = softwareMap.get(keyword) || [];
          for (const sw of matchedSoftware) {
            if (isVersionAffected(sw.version, cve.affected_versions)) {
              processedCVEs.add(cve.cve_id);
              
              const now = new Date().toISOString();
              vulnerabilities.push({
                agent_id,
                tenant_id,
                check_key: cve.cve_id,
                title: `${cve.cve_id}: ${truncate(cve.description, 100)}`,
                description: cve.description,
                severity: normalizeSeverity(cve.severity || getSeverityFromScore(cve.cvss_score)),
                remediation: generateRemediation(sw.name, cve),
                first_seen_at: now,
                last_seen_at: now
              });
              break; // One vulnerability entry per CVE
            }
          }
        }
      }
    }

    // 4. If no CVEs found in cache, fall back to hardcoded known vulnerabilities
    if (vulnerabilities.length === 0) {
      console.log(`[${requestId}] [SCAN-VULNS] No dynamic CVEs found, using fallback detection`);
      const fallbackVulns = await scanWithFallback(software as SoftwareItem[], agent_id, tenant_id);
      vulnerabilities.push(...fallbackVulns);
    }

    console.log(`[${requestId}] [SCAN-VULNS] Found ${vulnerabilities.length} total vulnerabilities`);

    // 5. Store findings in database
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
        console.error(`[${requestId}] [SCAN-VULNS] Error inserting vulnerabilities:`, insertError);
        throw insertError;
      }

      console.log(`[${requestId}] [SCAN-VULNS] Successfully stored ${vulnerabilities.length} vulnerability findings`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        vulnerabilities_found: vulnerabilities.length,
        software_scanned: software.length,
        keywords_searched: softwareKeywords.size,
        critical_vulns: vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high_vulns: vulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium_vulns: vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
        scan_method: vulnerabilities.length > 0 && vulnerabilities[0]?.metadata?.detection_method === 'nvd_database_match' 
          ? 'dynamic_nvd' 
          : 'fallback_signatures'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error 
      ? error.message 
      : (typeof error === 'object' && error !== null && 'message' in error) 
        ? String((error as any).message)
        : JSON.stringify(error) || 'Unknown error';
    console.error(`[${requestId}] [SCAN-VULNS] Error:`, message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Extract searchable keywords from software name with improved normalization
function extractKeywords(name: string): string[] {
  const keywords: string[] = [];
  let lowerName = name.toLowerCase();
  
  // FASE 3: Normalização melhorada para matching de CVE
  // Remove version suffix (e.g., "Chrome 120.0.6099.129" → "chrome")
  lowerName = lowerName.replace(/\s+\d+(\.\d+)*\s*$/, '');
  // Remove architecture suffix
  lowerName = lowerName.replace(/\s+(x64|x86|64-bit|32-bit|amd64|arm64)\s*$/i, '');
  // Remove common prefixes
  lowerName = lowerName.replace(/^(microsoft|adobe|google|mozilla|oracle|ibm|vmware|cisco|apple)\s+/i, '');
  
  // Common software patterns
  const knownProducts = [
    'chrome', 'firefox', 'edge', 'safari', 'opera', 'brave',
    'office', 'word', 'excel', 'powerpoint', 'outlook', 'teams', 'onenote', 'access',
    'acrobat', 'reader', 'photoshop', 'illustrator', 'premiere', 'after effects',
    'java', 'jre', 'jdk', 'python', 'nodejs', 'node.js', 'dotnet', '.net', 'runtime',
    'windows', 'defender', 'security', 'update',
    'zoom', 'slack', 'skype', 'discord', 'webex',
    'vlc', 'winrar', '7zip', '7-zip', 'notepad++', 'sublime',
    'git', 'vscode', 'visual studio', 'intellij', 'eclipse', 'pycharm',
    'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'sql server', 'sqlite', 'mariadb',
    'nginx', 'apache', 'httpd', 'iis', 'tomcat', 'jetty',
    'docker', 'kubernetes', 'k8s', 'vmware', 'virtualbox', 'hyper-v',
    'curl', 'openssl', 'openssh', 'putty', 'winscp', 'filezilla',
    'antivirus', 'kaspersky', 'norton', 'mcafee', 'avast', 'avg', 'bitdefender', 'eset',
    'cisco', 'fortinet', 'paloalto', 'fortigate', 'anyconnect',
    'winzip', 'peazip', 'rar', 'zip', 'tar',
    'pdf', 'foxit', 'sumatra',
    'driver', 'nvidia', 'amd', 'intel', 'realtek',
    'teamviewer', 'anydesk', 'rdp', 'vnc',
    'onedrive', 'dropbox', 'google drive', 'box'
  ];
  
  for (const product of knownProducts) {
    if (lowerName.includes(product)) {
      keywords.push(product);
    }
  }
  
  // If no known product found, use first word as keyword
  if (keywords.length === 0) {
    const firstWord = lowerName.split(/[\s\-_\.]/)[0];
    if (firstWord && firstWord.length >= 3) {
      keywords.push(firstWord);
    }
  }
  
  // Also add normalized full name for broader matching
  const normalizedFull = lowerName.split(/[\s\-_]/)[0];
  if (normalizedFull && normalizedFull.length >= 3 && !keywords.includes(normalizedFull)) {
    keywords.push(normalizedFull);
  }
  
  return keywords;
}

// Check if installed version is affected by CVE
function isVersionAffected(installedVersion: string, affectedVersions: any[]): boolean {
  if (!affectedVersions || affectedVersions.length === 0) {
    return true; // If no version info, consider potentially affected
  }
  
  const installed = parseVersion(installedVersion);
  
  for (const affected of affectedVersions) {
    // Check version range
    if (affected.versionEndExcluding) {
      const endVersion = parseVersion(affected.versionEndExcluding);
      if (compareVersions(installed, endVersion) < 0) {
        // Check start version if specified
        if (affected.versionStartIncluding) {
          const startVersion = parseVersion(affected.versionStartIncluding);
          if (compareVersions(installed, startVersion) >= 0) {
            return true;
          }
        } else {
          return true;
        }
      }
    } else if (affected.versionEndIncluding) {
      const endVersion = parseVersion(affected.versionEndIncluding);
      if (compareVersions(installed, endVersion) <= 0) {
        if (affected.versionStartIncluding) {
          const startVersion = parseVersion(affected.versionStartIncluding);
          if (compareVersions(installed, startVersion) >= 0) {
            return true;
          }
        } else {
          return true;
        }
      }
    }
  }
  
  return false;
}

function parseVersion(version: string): number[] {
  return version.split(/[.\-_]/).map(n => parseInt(n) || 0);
}

function compareVersions(v1: number[], v2: number[]): number {
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const p1 = v1[i] || 0;
    const p2 = v2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function getSeverityFromScore(score: number | null): string {
  if (score === null) return 'medium';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'low';
}

function normalizeSeverity(s: string | null | undefined): string {
  const val = (s || 'medium').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(val)) return val;
  return 'medium';
}

function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function generateRemediation(softwareName: string, cve: any): string {
  const baseName = softwareName.split(/[\s\-_]/)[0];
  const latestVersion = cve.affected_versions?.[0]?.versionEndExcluding;
  
  if (latestVersion) {
    return `Update ${baseName} to version ${latestVersion} or later`;
  }
  
  return `Update ${baseName} to the latest available version. Check vendor website for security patches.`;
}

// Fallback detection using known vulnerability signatures
async function scanWithFallback(
  software: SoftwareItem[], 
  agent_id: string, 
  tenant_id: string
): Promise<any[]> {
  const vulnerabilities: any[] = [];
  const knownVulnerableSoftware = getKnownVulnerabilities();

  for (const item of software) {
    const softwareName = item.name?.toLowerCase() || '';
    const version = item.version || '';

    const vulns = knownVulnerableSoftware.filter(kv => {
      const matchesName = softwareName.includes(kv.software.toLowerCase());
      const matchesVersion = version.includes(kv.affectedVersion) || 
                            compareVersionStrings(version, kv.affectedVersion) <= 0;
      return matchesName && matchesVersion;
    });

    for (const vuln of vulns) {
      const now = new Date().toISOString();
      vulnerabilities.push({
        agent_id,
        tenant_id,
        check_key: vuln.cve_id,
        title: vuln.title,
        description: vuln.description,
        severity: normalizeSeverity(vuln.severity),
        remediation: vuln.remediation,
        first_seen_at: now,
        last_seen_at: now
      });
    }
  }

  return vulnerabilities;
}

function compareVersionStrings(v1: string, v2: string): number {
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

function getKnownVulnerabilities() {
  // Fallback CVEs for common software
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
    },
    {
      cve_id: 'CVE-2024-3094',
      software: 'xz',
      affectedVersion: '5.6.1',
      title: 'XZ Utils Backdoor',
      description: 'Malicious code embedded in XZ Utils allowing SSH authentication bypass',
      severity: 'CRITICAL',
      cvss_score: 10.0,
      fix_available: true,
      remediation: 'Downgrade to XZ Utils 5.4.6 or upgrade to 5.6.2+'
    },
    {
      cve_id: 'CVE-2024-27198',
      software: 'TeamCity',
      affectedVersion: '2023.11',
      title: 'JetBrains TeamCity Authentication Bypass',
      description: 'Authentication bypass vulnerability allowing remote code execution',
      severity: 'CRITICAL',
      cvss_score: 9.8,
      fix_available: true,
      remediation: 'Update TeamCity to version 2023.11.4 or later'
    }
  ];
}
