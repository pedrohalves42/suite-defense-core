import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

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

    const { agent_id, tenant_id } = await req.json();

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
      throw softwareError;
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
    for (const keyword of Array.from(softwareKeywords).slice(0, 20)) { // Limit to 20 keywords
      const { data: cves, error: cveError } = await supabase
        .from('cve_database')
        .select('*')
        .or(`affected_products.cs.{${keyword}},description.ilike.%${keyword}%`)
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
              
              vulnerabilities.push({
                agent_id,
                tenant_id,
                cve_id: cve.cve_id,
                title: `${cve.cve_id}: ${truncate(cve.description, 100)}`,
                description: cve.description,
                severity: cve.severity || getSeverityFromScore(cve.cvss_score),
                cvss_score: cve.cvss_score,
                affected_software: sw.name,
                affected_version: sw.version,
                fix_available: true,
                remediation: generateRemediation(sw.name, cve),
                discovered_at: new Date().toISOString(),
                acknowledged: false,
                metadata: {
                  vendor: sw.vendor,
                  detection_method: 'nvd_database_match',
                  nvd_link: `https://nvd.nist.gov/vuln/detail/${cve.cve_id}`,
                  cvss_vector: cve.cvss_vector,
                  weaknesses: cve.weaknesses || [],
                  published_date: cve.published_date,
                  last_modified: cve.last_modified
                }
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] [SCAN-VULNS] Error:`, message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Extract searchable keywords from software name
function extractKeywords(name: string): string[] {
  const keywords: string[] = [];
  const lowerName = name.toLowerCase();
  
  // Common software patterns
  const knownProducts = [
    'chrome', 'firefox', 'edge', 'safari', 'opera',
    'office', 'word', 'excel', 'powerpoint', 'outlook', 'teams',
    'adobe', 'acrobat', 'reader', 'photoshop', 'illustrator',
    'java', 'python', 'nodejs', 'node.js', 'dotnet', '.net',
    'windows', 'defender', 'security',
    'zoom', 'slack', 'skype', 'discord',
    'vlc', 'winrar', '7zip', '7-zip', 'notepad++',
    'git', 'vscode', 'visual studio',
    'mysql', 'postgresql', 'mongodb', 'redis', 'sql server',
    'nginx', 'apache', 'iis', 'tomcat',
    'docker', 'kubernetes', 'vmware', 'virtualbox',
    'curl', 'openssl', 'openssh', 'putty',
    'antivirus', 'kaspersky', 'norton', 'mcafee', 'avast', 'avg',
    'cisco', 'fortinet', 'paloalto'
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
  if (score === null) return 'UNKNOWN';
  if (score >= 9.0) return 'CRITICAL';
  if (score >= 7.0) return 'HIGH';
  if (score >= 4.0) return 'MEDIUM';
  if (score >= 0.1) return 'LOW';
  return 'NONE';
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
          detection_method: 'fallback_signature_match',
          nvd_link: `https://nvd.nist.gov/vuln/detail/${vuln.cve_id}`
        }
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
