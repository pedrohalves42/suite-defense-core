/**
 * submit-endpoint-events — Unified EDR telemetry ingestion endpoint.
 * 
 * Accepts batched process, file, network, registry events from agents.
 * Runs local detection heuristics and flags suspicious activity.
 * 
 * Auth: X-Agent-Token (serveAgent middleware)
 */
import { serveAgent } from '../_shared/serve-tenant.ts';

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

const DETECTION_RULES: DetectionRule[] = [
  // T1059 - Command and Scripting Interpreter
  {
    id: 'DET-001', name: 'PowerShell Encoded Command', mitreId: 'T1059.001',
    mitreTactic: 'Execution', mitreName: 'PowerShell', severity: 'high', confidence: 85,
    type: 'process',
    match: (e) => /powershell/i.test(e.process_name || '') && /(-enc|-encodedcommand|frombase64)/i.test(e.command_line || ''),
  },
  {
    id: 'DET-002', name: 'CMD Spawned by Office', mitreId: 'T1059.001',
    mitreTactic: 'Execution', mitreName: 'Command-Line Interface', severity: 'high', confidence: 80,
    type: 'process',
    match: (e) => /cmd\.exe/i.test(e.process_name || '') && /(winword|excel|powerpnt|outlook)/i.test(e.parent_process_name || ''),
  },
  // T1003 - Credential Dumping
  {
    id: 'DET-003', name: 'LSASS Access Detected', mitreId: 'T1003.001',
    mitreTactic: 'Credential Access', mitreName: 'LSASS Memory', severity: 'critical', confidence: 90,
    type: 'process',
    match: (e) => /lsass/i.test(e.command_line || '') && !/csrss|wininit|services/i.test(e.parent_process_name || ''),
  },
  {
    id: 'DET-004', name: 'Mimikatz Indicators', mitreId: 'T1003',
    mitreTactic: 'Credential Access', mitreName: 'OS Credential Dumping', severity: 'critical', confidence: 95,
    type: 'process',
    match: (e) => /(mimikatz|sekurlsa|logonpasswords|kerberos::)/i.test(e.command_line || ''),
  },
  // T1547 - Persistence: Boot or Logon Autostart
  {
    id: 'DET-005', name: 'Run Key Modification', mitreId: 'T1547.001',
    mitreTactic: 'Persistence', mitreName: 'Registry Run Keys', severity: 'high', confidence: 75,
    type: 'registry',
    match: (e) => /(CurrentVersion\\Run|CurrentVersion\\RunOnce)/i.test(e.key_path || ''),
  },
  {
    id: 'DET-006', name: 'Startup Folder Drop', mitreId: 'T1547.001',
    mitreTactic: 'Persistence', mitreName: 'Startup Folder', severity: 'medium', confidence: 70,
    type: 'file',
    match: (e) => /(Startup|Start Menu\\Programs\\Startup)/i.test(e.file_path || '') && e.event_type === 'file_create',
  },
  // T1218 - Living Off the Land (LOLBins)
  {
    id: 'DET-007', name: 'LOLBin Execution', mitreId: 'T1218',
    mitreTactic: 'Defense Evasion', mitreName: 'System Binary Proxy Execution', severity: 'high', confidence: 70,
    type: 'process',
    match: (e) => /(mshta|regsvr32|rundll32|certutil|bitsadmin|wmic|msiexec)/i.test(e.process_name || '') &&
      /(http|ftp|\\\\|base64|decode|download)/i.test(e.command_line || ''),
  },
  // T1134 - Privilege Escalation: Token Manipulation
  {
    id: 'DET-008', name: 'Token Manipulation', mitreId: 'T1134',
    mitreTactic: 'Privilege Escalation', mitreName: 'Access Token Manipulation', severity: 'high', confidence: 80,
    type: 'process',
    match: (e) => /(runas|impersonate|token|privilege)/i.test(e.command_line || '') &&
      /(powershell|cmd)/i.test(e.process_name || ''),
  },
  // T1021 - Lateral Movement
  {
    id: 'DET-009', name: 'PsExec/SMB Lateral Movement', mitreId: 'T1021.002',
    mitreTactic: 'Lateral Movement', mitreName: 'SMB/Windows Admin Shares', severity: 'high', confidence: 85,
    type: 'process',
    match: (e) => /(psexec|paexec|smbexec|wmiexec)/i.test(e.process_name || e.command_line || ''),
  },
  {
    id: 'DET-010', name: 'WMI Remote Execution', mitreId: 'T1047',
    mitreTactic: 'Execution', mitreName: 'WMI', severity: 'medium', confidence: 70,
    type: 'process',
    match: (e) => /wmic/i.test(e.process_name || '') && /\/node:/i.test(e.command_line || ''),
  },
  // T1486 - Ransomware: Mass File Rename
  {
    id: 'DET-011', name: 'Mass File Rename (Ransomware)', mitreId: 'T1486',
    mitreTactic: 'Impact', mitreName: 'Data Encrypted for Impact', severity: 'critical', confidence: 60,
    type: 'file',
    match: (e) => e.event_type === 'file_rename' && /(encrypted|locked|crypt|ransom)/i.test(e.file_extension || ''),
  },
  // T1071 - C2 Communication
  {
    id: 'DET-012', name: 'Suspicious External Connection', mitreId: 'T1071',
    mitreTactic: 'Command and Control', mitreName: 'Application Layer Protocol', severity: 'medium', confidence: 50,
    type: 'network',
    match: (e) => e.direction === 'outbound' && e.remote_port && ![80, 443, 53, 8080].includes(e.remote_port) &&
      /(powershell|cmd|wscript|cscript|mshta)/i.test(e.process_name || ''),
  },
  // T1027 - Obfuscated Files
  {
    id: 'DET-013', name: 'Obfuscated Script Drop', mitreId: 'T1027',
    mitreTactic: 'Defense Evasion', mitreName: 'Obfuscated Files or Information', severity: 'medium', confidence: 65,
    type: 'file',
    match: (e) => e.event_type === 'file_create' && /(\.vbs|\.js|\.wsf|\.hta|\.ps1)$/i.test(e.file_path || '') &&
      /(temp|appdata|downloads)/i.test(e.file_path || ''),
  },
  // T1070 - Indicator Removal
  {
    id: 'DET-014', name: 'Event Log Clearing', mitreId: 'T1070.001',
    mitreTactic: 'Defense Evasion', mitreName: 'Clear Windows Event Logs', severity: 'critical', confidence: 90,
    type: 'process',
    match: (e) => /(wevtutil|clear-eventlog)/i.test(e.command_line || '') && /(cl |clear)/i.test(e.command_line || ''),
  },
  // T1053 - Scheduled Task
  {
    id: 'DET-015', name: 'Scheduled Task Creation', mitreId: 'T1053.005',
    mitreTactic: 'Persistence', mitreName: 'Scheduled Task', severity: 'medium', confidence: 65,
    type: 'process',
    match: (e) => /schtasks/i.test(e.process_name || '') && /\/create/i.test(e.command_line || ''),
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
            source_event_data: event,
            process_name: event.process_name,
            process_pid: event.pid || event.process_pid,
            command_line: event.command_line,
            file_path: event.file_path,
            remote_address: event.remote_address,
            event_time: event.event_time || new Date().toISOString(),
          });
        }
      } catch { /* skip malformed rule matches */ }
    }
  }
  return detections;
}

serveAgent(async (_req, ctx) => {
  const { body, agentId, tenantId, supabase } = ctx;
  
  const stats = { process: 0, file: 0, network: 0, registry: 0, detections: 0 };
  const allDetections: any[] = [];

  // ── Process Events ──
  if (body.process_events?.length) {
    const events = body.process_events.map((e: any) => ({
      ...e,
      tenant_id: tenantId,
      agent_id: agentId,
      event_time: e.event_time || new Date().toISOString(),
    }));
    const dets = runDetections(events, 'process');
    allDetections.push(...dets);
    
    const { error } = await supabase.from('endpoint_process_events').insert(events);
    if (error) console.error('[submit-endpoint-events] process insert error:', error.message);
    else stats.process = events.length;
  }

  // ── File Events ──
  if (body.file_events?.length) {
    const events = body.file_events.map((e: any) => ({
      ...e,
      tenant_id: tenantId,
      agent_id: agentId,
      event_time: e.event_time || new Date().toISOString(),
    }));
    const dets = runDetections(events, 'file');
    allDetections.push(...dets);
    
    const { error } = await supabase.from('endpoint_file_events').insert(events);
    if (error) console.error('[submit-endpoint-events] file insert error:', error.message);
    else stats.file = events.length;
  }

  // ── Network Events ──
  if (body.network_events?.length) {
    const events = body.network_events.map((e: any) => ({
      ...e,
      tenant_id: tenantId,
      agent_id: agentId,
      event_time: e.event_time || new Date().toISOString(),
    }));
    const dets = runDetections(events, 'network');
    allDetections.push(...dets);
    
    const { error } = await supabase.from('endpoint_network_events').insert(events);
    if (error) console.error('[submit-endpoint-events] network insert error:', error.message);
    else stats.network = events.length;
  }

  // ── Registry Events ──
  if (body.registry_events?.length) {
    const events = body.registry_events.map((e: any) => ({
      ...e,
      tenant_id: tenantId,
      agent_id: agentId,
      event_time: e.event_time || new Date().toISOString(),
    }));
    const dets = runDetections(events, 'registry');
    allDetections.push(...dets);
    
    const { error } = await supabase.from('endpoint_registry_events').insert(events);
    if (error) console.error('[submit-endpoint-events] registry insert error:', error.message);
    else stats.registry = events.length;
  }

  // ── Insert Detection Events ──
  if (allDetections.length > 0) {
    const detRows = allDetections.map(d => ({
      ...d,
      tenant_id: tenantId,
      agent_id: agentId,
    }));
    
    const { error } = await supabase.from('endpoint_detection_events').insert(detRows);
    if (error) console.error('[submit-endpoint-events] detection insert error:', error.message);
    else stats.detections = detRows.length;

    // Create system alerts for high/critical detections
    const criticalDets = allDetections.filter(d => d.severity === 'critical' || d.severity === 'high');
    if (criticalDets.length > 0) {
      const alerts = criticalDets.map(d => ({
        tenant_id: tenantId,
        alert_type: 'edr_detection',
        severity: d.severity,
        title: `[EDR] ${d.detection_name}`,
        description: d.description,
        status: 'active',
        metadata: {
          agent_id: agentId,
          mitre_technique_id: d.mitre_technique_id,
          mitre_tactic: d.mitre_tactic,
          confidence_score: d.confidence_score,
          detection_name: d.detection_name,
        },
      }));
      
      await supabase.from('system_alerts').insert(alerts);
    }
  }

  console.log(`[submit-endpoint-events] Agent ${agentId}: proc=${stats.process} file=${stats.file} net=${stats.network} reg=${stats.registry} detections=${stats.detections}`);

  return {
    success: true,
    stats,
    detections_triggered: allDetections.length,
  };
});
