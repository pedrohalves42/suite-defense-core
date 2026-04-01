export interface AgentInfo {
  id: string;
  hostname: string;
  agent_name: string;
  agent_version: string;
  os_type: string;
  os_version: string;
  status: string;
  agent_state: string;
  last_heartbeat: string;
  is_isolated: boolean;
}

export interface ProcessEntry {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  user: string;
  command_line?: string;
}

export interface NetworkEvent {
  remote_address: string;
  remote_port: number;
  process_name: string;
  direction: string;
  is_suspicious: boolean;
}

export interface FileEvent {
  file_path: string;
  event_type: string;
  process_name?: string;
  is_suspicious: boolean;
}

export interface ForensicData {
  agent: AgentInfo;
  processes: ProcessEntry[];
  suspiciousProcesses: string[][];
  networkSummary: { proc: string; count: number; uniqueIps: number }[];
  nonStandardPorts: { ip: string; port: string; proc: string }[];
  fileEvents: FileEvent[];
  alerts: { type: string; severity: string; title: string; message: string; created_at: string }[];
  domains: { domain: string; is_blocked: boolean }[];
  verdict: 'clean' | 'suspicious' | 'compromised';
  verdictDetails: string[];
}

export const KNOWN_SAFE_PROCESSES = new Set([
  'setuphost', 'sppsvc', 'systemsettings', 'systemsettingsbroker',
  'windowsupdatebox', 'wuauclt', 'tiworker', 'trustedinstaller',
  'mousocoreworker', 'searchfilterhost', 'searchprotocolhost',
  'smartscreen', 'notepad', 'snippingtool', 'backgroundtaskhost',
  'locationnotificationwindows', 'wudfhost', 'vds', 'chrome',
  'msedge', 'firefox', 'code', 'explorer', 'svchost', 'taskhostw',
  'applicationframehost', 'mstsc',
]);
