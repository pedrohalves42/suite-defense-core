/**
 * Vulnerability scanning helper functions.
 * Extracted from scan-vulnerabilities monolith for testability.
 */

export interface SoftwareItem {
  name: string;
  version: string;
  vendor: string | null;
}

export interface CVEMatch {
  cve_id: string;
  description: string;
  cvss_score: number | null;
  severity: string;
  cvss_vector: string | null;
  affected_versions: Record<string, unknown>[];
  weaknesses: string[];
  cve_references: Record<string, unknown>[];
  published_date: string;
}

/** Extract searchable keywords from software name */
export function extractKeywords(name: string): string[] {
  const keywords: string[] = [];
  let lowerName = name.toLowerCase();

  lowerName = lowerName.replace(/\s+\d+(\.\d+)*\s*$/, '');
  lowerName = lowerName.replace(/\s+(x64|x86|64-bit|32-bit|amd64|arm64)\s*$/i, '');
  lowerName = lowerName.replace(/^(microsoft|adobe|google|mozilla|oracle|ibm|vmware|cisco|apple)\s+/i, '');

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

  if (keywords.length === 0) {
    const firstWord = lowerName.split(/[\s\-_\.]/)[0];
    if (firstWord && firstWord.length >= 3) {
      keywords.push(firstWord);
    }
  }

  const normalizedFull = lowerName.split(/[\s\-_]/)[0];
  if (normalizedFull && normalizedFull.length >= 3 && !keywords.includes(normalizedFull)) {
    keywords.push(normalizedFull);
  }

  return keywords;
}

export function parseVersion(version: string): number[] {
  return version.split(/[.\-_]/).map(n => parseInt(n) || 0);
}

export function compareVersions(v1: number[], v2: number[]): number {
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const p1 = v1[i] || 0;
    const p2 = v2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export function isVersionAffected(installedVersion: string, affectedVersions: Array<Record<string, unknown>>): boolean {
  if (!affectedVersions || affectedVersions.length === 0) {
    return true;
  }

  const installed = parseVersion(installedVersion);

  for (const affected of affectedVersions) {
    if (affected.versionEndExcluding) {
      const endVersion = parseVersion(affected.versionEndExcluding as string);
      if (compareVersions(installed, endVersion) < 0) {
        if (affected.versionStartIncluding) {
          const startVersion = parseVersion(affected.versionStartIncluding as string);
          if (compareVersions(installed, startVersion) >= 0) return true;
        } else {
          return true;
        }
      }
    } else if (affected.versionEndIncluding) {
      const endVersion = parseVersion(affected.versionEndIncluding as string);
      if (compareVersions(installed, endVersion) <= 0) {
        if (affected.versionStartIncluding) {
          const startVersion = parseVersion(affected.versionStartIncluding as string);
          if (compareVersions(installed, startVersion) >= 0) return true;
        } else {
          return true;
        }
      }
    }
  }

  return false;
}

export function getSeverityFromScore(score: number | null): string {
  if (score === null) return 'medium';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 0.1) return 'low';
  return 'low';
}

export function normalizeSeverity(s: string | null | undefined): string {
  const val = (s || 'medium').toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(val)) return val;
  return 'medium';
}

export function truncate(text: string, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

export function generateRemediation(softwareName: string, cve: Record<string, unknown>): string {
  const baseName = softwareName.split(/[\s\-_]/)[0];
  const affectedVersions = cve.affected_versions as Array<Record<string, unknown>> | undefined;
  const latestVersion = affectedVersions?.[0]?.versionEndExcluding;

  if (latestVersion) {
    return `Update ${baseName} to version ${latestVersion} or later`;
  }

  return `Update ${baseName} to the latest available version. Check vendor website for security patches.`;
}

export function compareVersionStrings(v1: string, v2: string): number {
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

export function getKnownVulnerabilities() {
  return [
    { cve_id: 'CVE-2024-21762', software: 'Chrome', affectedVersion: '120', title: 'Google Chrome Use After Free Vulnerability', description: 'Use after free vulnerability in V8 in Google Chrome prior to 120.0.6099.129', severity: 'HIGH', cvss_score: 8.8, fix_available: true, remediation: 'Update to Chrome version 120.0.6099.129 or later' },
    { cve_id: 'CVE-2024-20672', software: 'Firefox', affectedVersion: '120', title: 'Mozilla Firefox Memory Corruption', description: 'Memory corruption vulnerability in Firefox ESR and Firefox', severity: 'HIGH', cvss_score: 8.6, fix_available: true, remediation: 'Update to Firefox 121.0 or later' },
    { cve_id: 'CVE-2023-36884', software: 'Office', affectedVersion: '2019', title: 'Microsoft Office Remote Code Execution', description: 'Windows Search Remote Code Execution Vulnerability affecting Office', severity: 'CRITICAL', cvss_score: 9.8, fix_available: true, remediation: 'Apply Microsoft security updates for Office 2019' },
    { cve_id: 'CVE-2023-21709', software: 'Windows', affectedVersion: '10', title: 'Windows Common Log File System Driver Elevation of Privilege', description: 'Elevation of privilege vulnerability in Windows Common Log File System Driver', severity: 'HIGH', cvss_score: 7.8, fix_available: true, remediation: 'Install Windows Update KB5022845 or later' },
    { cve_id: 'CVE-2024-21413', software: 'Outlook', affectedVersion: '2016', title: 'Microsoft Outlook Remote Code Execution', description: 'Remote Code Execution vulnerability in Microsoft Outlook', severity: 'CRITICAL', cvss_score: 9.8, fix_available: true, remediation: 'Update to latest Outlook version with February 2024 patches' },
    { cve_id: 'CVE-2023-38545', software: 'curl', affectedVersion: '8.3', title: 'Curl SOCKS5 Heap Buffer Overflow', description: 'Heap buffer overflow in SOCKS5 proxy handshake', severity: 'HIGH', cvss_score: 7.5, fix_available: true, remediation: 'Update curl to version 8.4.0 or later' },
    { cve_id: 'CVE-2024-3094', software: 'xz', affectedVersion: '5.6.1', title: 'XZ Utils Backdoor', description: 'Malicious code embedded in XZ Utils allowing SSH authentication bypass', severity: 'CRITICAL', cvss_score: 10.0, fix_available: true, remediation: 'Downgrade to XZ Utils 5.4.6 or upgrade to 5.6.2+' },
    { cve_id: 'CVE-2024-27198', software: 'TeamCity', affectedVersion: '2023.11', title: 'JetBrains TeamCity Authentication Bypass', description: 'Authentication bypass vulnerability allowing remote code execution', severity: 'CRITICAL', cvss_score: 9.8, fix_available: true, remediation: 'Update TeamCity to version 2023.11.4 or later' },
  ];
}

/** Fallback detection using known vulnerability signatures */
export function scanWithFallback(
  software: SoftwareItem[],
  agent_id: string,
  tenant_id: string
): Array<Record<string, unknown>> {
  const vulnerabilities: Array<Record<string, unknown>> = [];
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
