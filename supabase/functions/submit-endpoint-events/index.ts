/**
 * submit-endpoint-events — Unified EDR telemetry ingestion endpoint.
 * 
 * ARCHITECTURE: Event Buffer Pattern (10-30x throughput improvement)
 * Instead of inserting directly into 4+ event tables, events are written
 * to a single `endpoint_event_buffer` table. A separate batch worker
 * (`flush-event-buffer`) processes them in bulk periodically.
 * 
 * This dramatically reduces DB write pressure under high agent load.
 * 
 * Detection heuristics still run inline to provide real-time alerting.
 * 
 * Auth: X-Agent-Token (serveAgent middleware)
 */
import { serveAgent } from '../_shared/serve-tenant.ts';

// V-2006: Batch size limit to prevent DoS
const MAX_EVENTS_PER_BATCH = 1000;
const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

// ── MITRE ATT&CK Detection Rules (Local Engine) ──

interface DetectionRule {
  id: string;
  name: string;
  mitreId: string;
  mitreTactic: string;
  mitreName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  type: 'process' | 'file' | 'network' | 'registry';
  match: (event: any) => boolean;
}

// V-2007: Pre-compiled regex patterns to avoid 15K+ compilations per batch
const RE_POWERSHELL = /powershell/i;
const RE_ENCODED_CMD = /(-enc|-encodedcommand|frombase64)/i;
const RE_CMD_EXE = /cmd\.exe/i;
const RE_OFFICE = /(winword|excel|powerpnt|outlook)/i;
const RE_LSASS = /lsass/i;
const RE_LSASS_PARENTS = /csrss|wininit|services/i;
const RE_MIMIKATZ = /(mimikatz|sekurlsa|logonpasswords|kerberos::)/i;
const RE_RUN_KEYS = /(CurrentVersion\\Run|CurrentVersion\\RunOnce)/i;
const RE_STARTUP = /(Startup|Start Menu\\Programs\\Startup)/i;
const RE_LOLBINS = /(mshta|regsvr32|rundll32|certutil|bitsadmin|wmic|msiexec)/i;
const RE_LOLBIN_ARGS = /(http|ftp|\\\\|base64|decode|download)/i;
const RE_TOKEN = /(runas|impersonate|token|privilege)/i;
const RE_SHELL = /(powershell|cmd)/i;
const RE_PSEXEC = /(psexec|paexec|smbexec|wmiexec)/i;
const RE_WMIC = /wmic/i;
const RE_NODE = /\/node:/i;
const RE_RANSOMWARE_EXT = /(encrypted|locked|crypt|ransom)/i;
const RE_C2_PROC = /(powershell|cmd|wscript|cscript|mshta)/i;
const RE_SCRIPT_EXT = /(\.vbs|\.js|\.wsf|\.hta|\.ps1)$/i;
const RE_TEMP_PATH = /(temp|appdata|downloads)/i;
const RE_WEVTUTIL = /(wevtutil|clear-eventlog)/i;
const RE_CLEAR = /(cl |clear)/i;
const RE_SCHTASKS = /schtasks/i;
const RE_CREATE = /\/create/i;

const DETECTION_RULES: DetectionRule[] = [
  {
    id: 'DET-001', name: 'PowerShell Encoded Command', mitreId: 'T1059.001',
    mitreTactic: 'Execution', mitreName: 'PowerShell', severity: 'high', confidence: 85,
    type: 'process',
    match: (e) => RE_POWERSHELL.test(e.process_name || '') && RE_ENCODED_CMD.test(e.command_line || ''),
  },
  {
    id: 'DET-002', name: 'CMD Spawned by Office', mitreId: 'T1059.001',
    mitreTactic: 'Execution', mitreName: 'Command-Line Interface', severity: 'high', confidence: 80,
    type: 'process',
    match: (e) => RE_CMD_EXE.test(e.process_name || '') && RE_OFFICE.test(e.parent_process_name || ''),
  },
  {
    id: 'DET-003', name: 'LSASS Access Detected', mitreId: 'T1003.001',
    mitreTactic: 'Credential Access', mitreName: 'LSASS Memory', severity: 'critical', confidence: 90,
    type: 'process',
    match: (e) => RE_LSASS.test(e.command_line || '') && !RE_LSASS_PARENTS.test(e.parent_process_name || ''),
  },
  {
    id: 'DET-004', name: 'Mimikatz Indicators', mitreId: 'T1003',
    mitreTactic: 'Credential Access', mitreName: 'OS Credential Dumping', severity: 'critical', confidence: 95,
    type: 'process',
    match: (e) => RE_MIMIKATZ.test(e.command_line || ''),
  },
  {
    id: 'DET-005', name: 'Run Key Modification', mitreId: 'T1547.001',
    mitreTactic: 'Persistence', mitreName: 'Registry Run Keys', severity: 'high', confidence: 75,
    type: 'registry',
    match: (e) => RE_RUN_KEYS.test(e.key_path || ''),
  },
  {
    id: 'DET-006', name: 'Startup Folder Drop', mitreId: 'T1547.001',
    mitreTactic: 'Persistence', mitreName: 'Startup Folder', severity: 'medium', confidence: 70,
    type: 'file',
    match: (e) => RE_STARTUP.test(e.file_path || '') && e.event_type === 'file_create',
  },
  {
    id: 'DET-007', name: 'LOLBin Execution', mitreId: 'T1218',
    mitreTactic: 'Defense Evasion', mitreName: 'System Binary Proxy Execution', severity: 'high', confidence: 70,
    type: 'process',
    match: (e) => RE_LOLBINS.test(e.process_name || '') && RE_LOLBIN_ARGS.test(e.command_line || ''),
  },
  {
    id: 'DET-008', name: 'Token Manipulation', mitreId: 'T1134',
    mitreTactic: 'Privilege Escalation', mitreName: 'Access Token Manipulation', severity: 'high', confidence: 80,
    type: 'process',
    match: (e) => RE_TOKEN.test(e.command_line || '') && RE_SHELL.test(e.process_name || ''),
  },
  {
    id: 'DET-009', name: 'PsExec/SMB Lateral Movement', mitreId: 'T1021.002',
    mitreTactic: 'Lateral Movement', mitreName: 'SMB/Windows Admin Shares', severity: 'high', confidence: 85,
    type: 'process',
    match: (e) => RE_PSEXEC.test(e.process_name || e.command_line || ''),
  },
  {
    id: 'DET-010', name: 'WMI Remote Execution', mitreId: 'T1047',
    mitreTactic: 'Execution', mitreName: 'WMI', severity: 'medium', confidence: 70,
    type: 'process',
    match: (e) => RE_WMIC.test(e.process_name || '') && RE_NODE.test(e.command_line || ''),
  },
  {
    id: 'DET-011', name: 'Mass File Rename (Ransomware)', mitreId: 'T1486',
    mitreTactic: 'Impact', mitreName: 'Data Encrypted for Impact', severity: 'critical', confidence: 60,
    type: 'file',
    match: (e) => e.event_type === 'file_rename' && RE_RANSOMWARE_EXT.test(e.file_extension || ''),
  },
  {
    id: 'DET-012', name: 'Suspicious External Connection', mitreId: 'T1071',
    mitreTactic: 'Command and Control', mitreName: 'Application Layer Protocol', severity: 'medium', confidence: 50,
    type: 'network',
    match: (e) => e.direction === 'outbound' && e.remote_port && ![80, 443, 53, 8080].includes(e.remote_port) &&
      RE_C2_PROC.test(e.process_name || ''),
  },
  {
    id: 'DET-013', name: 'Obfuscated Script Drop', mitreId: 'T1027',
    mitreTactic: 'Defense Evasion', mitreName: 'Obfuscated Files or Information', severity: 'medium', confidence: 65,
    type: 'file',
    match: (e) => e.event_type === 'file_create' && RE_SCRIPT_EXT.test(e.file_path || '') &&
      RE_TEMP_PATH.test(e.file_path || ''),
  },
  {
    id: 'DET-014', name: 'Event Log Clearing', mitreId: 'T1070.001',
    mitreTactic: 'Defense Evasion', mitreName: 'Clear Windows Event Logs', severity: 'critical', confidence: 90,
    type: 'process',
    match: (e) => RE_WEVTUTIL.test(e.command_line || '') && RE_CLEAR.test(e.command_line || ''),
  },
  {
    id: 'DET-015', name: 'Scheduled Task Creation', mitreId: 'T1053.005',
    mitreTactic: 'Persistence', mitreName: 'Scheduled Task', severity: 'medium', confidence: 65,
    type: 'process',
    match: (e) => RE_SCHTASKS.test(e.process_name || '') && RE_CREATE.test(e.command_line || ''),
  },
];

function runDetections(events: any[], type: string): any[] {
  const rules = DETECTION_RULES.filter(r => r.type === type);
  const detections: any[] = [];
  
  for (const event of events) {
    for (const rule of rules) {
      try {
        if (rule.match(event)) {
          event.is_suspicious = true;
          event.mitre_technique_id = event.mitre_technique_id || rule.mitreId;
          event.mitre_tactic = event.mitre_tactic || rule.mitreTactic;
          if (!event.detection_tags) event.detection_tags = [];
          event.detection_tags.push(rule.id);
          
          detections.push({
            detection_name: rule.name,
            severity: rule.severity,
            confidence_score: rule.confidence,
            mitre_technique_id: rule.mitreId,
            mitre_tactic: rule.mitreTactic,
            mitre_technique_name: rule.mitreName,
            description: `${rule.name} detected: ${event.process_name || event.file_path || event.remote_address || event.key_path}`,
            source_event_type: type,
            source_event_data: {
              event_id: event.id,
              process_name: event.process_name,
              command_line: (event.command_line || '').substring(0, 500),
            },
            process_name: event.process_name,
            process_pid: event.pid || event.process_pid,
            command_line: event.command_line,
            file_path: event.file_path,
            remote_address: event.remote_address,
            event_time: event.event_time || new Date().toISOString(),
          });
        }
      } catch (err) { console.warn(`[submit-endpoint-events] Rule ${rule.id} match error:`, (err as Error).message); }
    }
  }
  return detections;
}

async function triggerBufferFlush() {
  if (!INTERNAL_FUNCTION_SECRET || !SUPABASE_URL) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/flush-event-buffer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_FUNCTION_SECRET,
      },
      body: '{}',
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      console.warn(`[submit-endpoint-events] flush trigger failed with status ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[submit-endpoint-events] flush trigger error: ${message}`);
  }
}

serveAgent(async (_req, ctx) => {
  const { body, agentId, tenantId, supabase } = ctx;
  
  const stats = { process: 0, file: 0, network: 0, registry: 0, detections: 0, buffered: 0 };
  const allDetections: any[] = [];

  // V-2006: Apply batch limits to prevent DoS from compromised agents
  const processEvents = (body.process_events || []).slice(0, MAX_EVENTS_PER_BATCH);
  const fileEvents = (body.file_events || []).slice(0, MAX_EVENTS_PER_BATCH);
  const networkEvents = (body.network_events || []).slice(0, MAX_EVENTS_PER_BATCH);
  const registryEvents = (body.registry_events || []).slice(0, MAX_EVENTS_PER_BATCH);

  // Prepare events with tenant/agent context
  const prepareEvents = (events: any[]) => events.map((e: any) => ({
    ...e,
    tenant_id: tenantId,
    agent_id: agentId,
    event_time: e.event_time || new Date().toISOString(),
  }));

  const preparedProcess = processEvents.length ? prepareEvents(processEvents) : [];
  const preparedFile = fileEvents.length ? prepareEvents(fileEvents) : [];
  const preparedNetwork = networkEvents.length ? prepareEvents(networkEvents) : [];
  const preparedRegistry = registryEvents.length ? prepareEvents(registryEvents) : [];

  // ── Run detections INLINE for real-time alerting ──
  if (preparedProcess.length) allDetections.push(...runDetections(preparedProcess, 'process'));
  if (preparedFile.length) allDetections.push(...runDetections(preparedFile, 'file'));
  if (preparedNetwork.length) allDetections.push(...runDetections(preparedNetwork, 'network'));
  if (preparedRegistry.length) allDetections.push(...runDetections(preparedRegistry, 'registry'));

  // ── EVENT BUFFER: Single-table write instead of 4 separate inserts ──
  // This reduces DB write pressure by ~75% (1 INSERT vs 4 INSERTs)
  // The flush-event-buffer worker distributes to final tables in batch
  const bufferRows: { tenant_id: string; agent_id: string; event_category: string; payload: any }[] = [];

  // V-AUDIT: Consolidated loop instead of 4 separate iterations
  const categories: { events: any[]; category: string }[] = [
    { events: preparedProcess, category: 'process' },
    { events: preparedFile, category: 'file' },
    { events: preparedNetwork, category: 'network' },
    { events: preparedRegistry, category: 'registry' },
  ];
  for (const { events, category } of categories) {
    for (const e of events) {
      bufferRows.push({ tenant_id: tenantId, agent_id: agentId, event_category: category, payload: e });
    }
  }

  // Single bulk INSERT into buffer (instead of 4 separate table inserts)
  const insertPromises: Promise<void>[] = [];

  if (bufferRows.length > 0) {
    // Chunk buffer rows to avoid oversized payloads (500 rows per chunk)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < bufferRows.length; i += CHUNK_SIZE) {
      const chunk = bufferRows.slice(i, i + CHUNK_SIZE);
      insertPromises.push(
        supabase.from('endpoint_event_buffer').insert(chunk).then(({ error }: any) => {
          if (error) console.error('[submit-endpoint-events] buffer insert error:', error.message);
          else stats.buffered += chunk.length;
        })
      );
    }
  }

  // Track per-category counts for response
  stats.process = preparedProcess.length;
  stats.file = preparedFile.length;
  stats.network = preparedNetwork.length;
  stats.registry = preparedRegistry.length;

  await Promise.all(insertPromises);

  // V-3010 FIX: trigger internal flush immediately so EDR does not depend solely on cron auth
  if (stats.buffered > 0) {
    await triggerBufferFlush();
  }

  // ── Insert Detection Events (still direct — these are low volume, high priority) ──
  if (allDetections.length > 0) {
    const detRows = allDetections.map(d => ({
      ...d,
      tenant_id: tenantId,
      agent_id: agentId,
    }));
    
    const { error } = await supabase.from('endpoint_detection_events').insert(detRows);
    if (error) console.error('[submit-endpoint-events] detection insert error:', error.message);
    else stats.detections = detRows.length;

    // Create system alerts for high/critical detections (real-time, not buffered)
    const criticalDets = allDetections.filter(d => d.severity === 'critical' || d.severity === 'high');
    if (criticalDets.length > 0) {
      const alerts = criticalDets.map(d => ({
        tenant_id: tenantId,
        alert_type: 'edr_detection',
        severity: d.severity,
        title: `[EDR] ${d.detection_name}`,
        message: d.description || `EDR detection: ${d.detection_name}`,
        resolved: false,
        metadata: {
          agent_id: agentId,
          mitre_technique_id: d.mitre_technique_id,
          mitre_tactic: d.mitre_tactic,
          confidence_score: d.confidence_score,
          detection_name: d.detection_name,
        },
      }));
      
      const { error: alertError } = await supabase.from('system_alerts').insert(alerts);
      if (alertError) console.error('[submit-endpoint-events] alert insert error:', alertError.message);
    }
  }

  console.log(`[submit-endpoint-events] Agent ${agentId}: buffered=${stats.buffered} detections=${stats.detections}`);

  return {
    success: true,
    stats,
    detections_triggered: allDetections.length,
  };
});