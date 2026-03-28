/**
 * Forensic Investigation Report PDF Generator
 * Generates comprehensive security analysis reports for individual or multiple agents.
 */
import { supabase } from '@/integrations/supabase/client';
import { loadLogoForPDF, addLogoToPDF } from '@/lib/pdfLogoHelper';

interface AgentInfo {
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

interface ProcessEntry {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  user: string;
  command_line?: string;
}

interface NetworkEvent {
  remote_address: string;
  remote_port: number;
  process_name: string;
  direction: string;
  is_suspicious: boolean;
}

interface FileEvent {
  file_path: string;
  event_type: string;
  process_name?: string;
  is_suspicious: boolean;
}

interface ForensicData {
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

// Known safe processes that run from temp paths
const KNOWN_SAFE_PROCESSES = new Set([
  'setuphost', 'sppsvc', 'systemsettings', 'systemsettingsbroker',
  'windowsupdatebox', 'wuauclt', 'tiworker', 'trustedinstaller',
  'mousocoreworker', 'searchfilterhost', 'searchprotocolhost',
  'smartscreen', 'notepad', 'snippingtool', 'backgroundtaskhost',
  'locationnotificationwindows', 'wudfhost', 'vds', 'chrome',
  'msedge', 'firefox', 'code', 'explorer', 'svchost', 'taskhostw',
  'applicationframehost', 'mstsc',
]);

async function fetchForensicData(agentId: string): Promise<ForensicData> {
  // Fetch agent info
  const { data: agentRow } = await supabase
    .from('agents')
    .select('id, hostname, agent_name, agent_version, os_type, os_version, status, agent_state, last_heartbeat, is_isolated')
    .eq('id', agentId)
    .single();

  if (!agentRow) throw new Error('Agente não encontrado');

  const agent = agentRow as any as AgentInfo;

  // Fetch latest process snapshot
  const { data: processRows } = await supabase
    .from('agent_processes')
    .select('processes, suspicious_processes, collected_at')
    .eq('agent_id', agentId)
    .order('collected_at', { ascending: false })
    .limit(5);

  const latestSnapshot = processRows?.[0];
  const processes: ProcessEntry[] = ((latestSnapshot?.processes as any[]) || []).map((p: any) => ({
    pid: p.pid, name: p.name, cpu_percent: p.cpu_percent,
    memory_mb: p.memory_mb, user: p.user, command_line: p.command_line,
  }));

  // Collect all suspicious process names from recent snapshots
  const suspiciousProcesses: string[][] = (processRows || [])
    .filter(( r: any) => r.suspicious_processes && (r.suspicious_processes as string[]).length > 0)
    .map(( r: any) => [
      new Date(r.collected_at).toLocaleString('pt-BR'),
      ...(r.suspicious_processes as string[]),
    ]);

  // Fetch network events from buffer
  const { data: netRaw } = await supabase
    .from('endpoint_event_buffer')
    .select('payload')
    .eq('agent_id', agentId)
    .eq('event_category', 'network')
    .order('received_at', { ascending: false })
    .limit(500);

  const networkEvents: NetworkEvent[] = ((netRaw || []) as any[]).map(( r: any) => ({
    remote_address: r.payload?.remote_address || '',
    remote_port: Number(r.payload?.remote_port) || 0,
    process_name: r.payload?.process_name || '',
    direction: r.payload?.direction || '',
    is_suspicious: r.payload?.is_suspicious === true || r.payload?.is_suspicious === 'true',
  }));

  // Network summary by process
  const procMap = new Map<string, { count: number; ips: Set<string> }>();
  for (const ne of networkEvents) {
    const entry = procMap.get(ne.process_name) || { count: 0, ips: new Set<string>() };
    entry.count++;
    entry.ips.add(ne.remote_address);
    procMap.set(ne.process_name, entry);
  }
  const networkSummary = Array.from(procMap.entries())
    .map(([proc, v]) => ({ proc, count: v.count, uniqueIps: v.ips.size }))
    .sort((a, b) => b.count - a.count);

  // Non-standard ports
  const nonStdPorts = networkEvents
    .filter(ne => ne.remote_port !== 80 && ne.remote_port !== 443 && ne.remote_port > 0)
    .slice(0, 20)
    .map(ne => ({ ip: ne.remote_address, port: String(ne.remote_port), proc: ne.process_name }));

  // File events from buffer
  const { data: fileRaw } = await supabase
    .from('endpoint_event_buffer')
    .select('payload')
    .eq('agent_id', agentId)
    .eq('event_category', 'file')
    .order('received_at', { ascending: false })
    .limit(50);

  const fileEvents: FileEvent[] = ((fileRaw || []) as any[]).map(( r: any) => ({
    file_path: r.payload?.file_path || '',
    event_type: r.payload?.event_type || '',
    process_name: r.payload?.process_name || undefined,
    is_suspicious: r.payload?.is_suspicious === true || r.payload?.is_suspicious === 'true',
  }));

  // System alerts
  const { data: alertsRaw } = await supabase
    .from('system_alerts')
    .select('alert_type, severity, title, message, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(20);

  const alerts = ((alertsRaw || []) as any[]).map((a: any) => ({
    type: a.alert_type, severity: a.severity,
    title: a.title, message: a.message, created_at: a.created_at,
  }));

  // DNS/Web domains
  const { data: domainsRaw } = await supabase
    .from('agent_web_activity')
    .select('domain, is_blocked')
    .eq('agent_id', agentId)
    .order('visited_at', { ascending: false })
    .limit(50);

  const domainsMap = new Map<string, boolean>();
  for (const d of (domainsRaw || []) as any[]) {
    if (d.domain && !domainsMap.has(d.domain)) {
      domainsMap.set(d.domain, d.is_blocked === true);
    }
  }
  const domains = Array.from(domainsMap.entries()).map(([domain, is_blocked]) => ({ domain, is_blocked }));

  // Determine verdict
  const realSuspicious = suspiciousProcesses.flat()
    .filter(name => typeof name === 'string' && !KNOWN_SAFE_PROCESSES.has(name.toLowerCase()));
  const hasSuspiciousNetwork = networkEvents.some(ne => ne.is_suspicious);
  const hasSuspiciousFiles = fileEvents.some(fe => fe.is_suspicious);
  const hasCriticalAlerts = alerts.some(a => a.severity === 'critical');

  let verdict: 'clean' | 'suspicious' | 'compromised' = 'clean';
  const verdictDetails: string[] = [];

  if (hasCriticalAlerts) {
    verdict = 'suspicious';
    verdictDetails.push('Alertas críticos detectados no histórico');
  }
  if (realSuspicious.length > 3) {
    verdict = 'suspicious';
    verdictDetails.push(`${realSuspicious.length} processos genuinamente suspeitos detectados`);
  }
  if (hasSuspiciousNetwork) {
    verdict = 'suspicious';
    verdictDetails.push('Conexões de rede marcadas como suspeitas');
  }
  if (hasSuspiciousFiles) {
    verdict = 'suspicious';
    verdictDetails.push('Atividade de arquivo suspeita detectada');
  }
  if (verdict === 'clean') {
    verdictDetails.push('Nenhuma evidência de comprometimento detectada');
    verdictDetails.push('Todos os processos identificados são legítimos');
    verdictDetails.push('Tráfego de rede dentro dos padrões normais');
  }

  return {
    agent, processes, suspiciousProcesses, networkSummary,
    nonStandardPorts: nonStdPorts, fileEvents, alerts, domains,
    verdict, verdictDetails,
  };
}

function getVerdictLabel(v: 'clean' | 'suspicious' | 'compromised') {
  if (v === 'clean') return '✅ LIMPO — Nenhuma ameaça detectada';
  if (v === 'suspicious') return '⚠️ SUSPEITO — Investigação recomendada';
  return '🔴 COMPROMETIDO — Ação imediata necessária';
}

function getVerdictColor(v: 'clean' | 'suspicious' | 'compromised'): [number, number, number] {
  if (v === 'clean') return [34, 139, 34];
  if (v === 'suspicious') return [255, 165, 0];
  return [220, 20, 60];
}

export async function generateForensicReportPDF(agentIds: string[]): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const logoDataUrl = await loadLogoForPDF();

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const now = new Date();
  const isMultiple = agentIds.length > 1;

  for (let idx = 0; idx < agentIds.length; idx++) {
    if (idx > 0) doc.addPage();

    const data = await fetchForensicData(agentIds[idx]);
    let y = 15;

    // Header
    addLogoToPDF(doc, logoDataUrl, 20, y, 14);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Relatório de Investigação Forense', pageWidth / 2, y + 8, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Gerado em: ${now.toLocaleString('pt-BR')}`, pageWidth / 2, y + 14, { align: 'center' });
    if (isMultiple) {
      doc.text(`Máquina ${idx + 1} de ${agentIds.length}`, pageWidth / 2, y + 19, { align: 'center' });
      y += 24;
    } else {
      y += 20;
    }

    // Separator line
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.8);
    doc.line(14, y, pageWidth - 14, y);
    y += 6;

    // === VERDICT ===
    const [vr, vg, vb] = getVerdictColor(data.verdict);
    doc.setFillColor(vr, vg, vb);
    doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(getVerdictLabel(data.verdict), pageWidth / 2, y + 9, { align: 'center' });
    y += 20;

    // === AGENT INFO ===
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Informações do Agente', 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Campo', 'Valor']],
      body: [
        ['Nome', data.agent.agent_name],
        ['Hostname', data.agent.hostname],
        ['Versão', data.agent.agent_version],
        ['SO', `${data.agent.os_type} ${data.agent.os_version}`],
        ['Estado', data.agent.agent_state],
        ['Status', data.agent.status],
        ['Isolado', data.agent.is_isolated ? 'SIM' : 'Não'],
        ['Último Heartbeat', new Date(data.agent.last_heartbeat).toLocaleString('pt-BR')],
      ],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // === VERDICT DETAILS ===
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Detalhes do Veredicto', 14, y);
    y += 5;
    autoTable(doc, {
      startY: y,
      body: data.verdictDetails.map(d => [d]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // === TOP PROCESSES ===
    if (y > 240) { doc.addPage(); y = 15; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Processos Ativos (${data.processes.length} total)`, 14, y);
    y += 5;

    const topProcs = [...data.processes]
      .sort((a, b) => b.cpu_percent - a.cpu_percent)
      .slice(0, 15);

    autoTable(doc, {
      startY: y,
      head: [['PID', 'Nome', 'CPU %', 'RAM (MB)', 'Usuário']],
      body: topProcs.map(p => [
        p.pid, p.name,
        p.cpu_percent?.toFixed(1) || '0',
        p.memory_mb?.toFixed(0) || '0',
        p.user || '-',
      ]),
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // === SUSPICIOUS PROCESSES ===
    if (data.suspiciousProcesses.length > 0) {
      if (y > 240) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Processos Flagrados', 14, y);
      y += 2;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('Nota: Muitos são falsos positivos (processos do Windows em pastas temporárias)', 14, y + 3);
      doc.setTextColor(30, 30, 30);
      y += 6;

      autoTable(doc, {
        startY: y,
        head: [['Horário', 'Processos']],
        body: data.suspiciousProcesses.map(row => [
          row[0],
          row.slice(1).join(', '),
        ]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [245, 158, 11], textColor: 255 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // === NETWORK SUMMARY ===
    if (data.networkSummary.length > 0) {
      if (y > 220) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo de Rede por Processo', 14, y);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['Processo', 'Conexões', 'IPs Únicos', 'Risco']],
        body: data.networkSummary.slice(0, 15).map(ns => {
          let risk = 'Normal';
          const lp = ns.proc.toLowerCase();
          if (['powershell', 'cmd', 'wscript', 'cscript', 'mshta'].includes(lp)) risk = 'Verificar';
          if (['lsass', 'csrss'].includes(lp)) risk = 'Atenção';
          return [ns.proc, ns.count, ns.uniqueIps, risk];
        }),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        margin: { left: 14, right: 14 },
        didParseCell: (hookData: any) => {
          if (hookData.column.index === 3 && hookData.section === 'body') {
            const val = hookData.cell.raw;
            if (val === 'Atenção') hookData.cell.styles.textColor = [220, 20, 60];
            else if (val === 'Verificar') hookData.cell.styles.textColor = [245, 158, 11];
            else hookData.cell.styles.textColor = [34, 139, 34];
          }
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // === NON-STANDARD PORTS ===
    if (data.nonStandardPorts.length > 0) {
      if (y > 230) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Conexões em Portas Não-Padrão', 14, y);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['IP Remoto', 'Porta', 'Processo']],
        body: data.nonStandardPorts.map(np => [np.ip, np.port, np.proc]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [245, 158, 11], textColor: 255 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // === FILE EVENTS ===
    if (data.fileEvents.length > 0) {
      if (y > 230) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Atividade de Arquivos', 14, y);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['Tipo', 'Caminho', 'Processo', 'Suspeito']],
        body: data.fileEvents.slice(0, 20).map(fe => [
          fe.event_type, fe.file_path?.substring(0, 60) || '-',
          fe.process_name || '-', fe.is_suspicious ? 'SIM' : 'Não',
        ]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        margin: { left: 14, right: 14 },
        columnStyles: { 1: { cellWidth: 80 } },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // === DOMAINS ===
    if (data.domains.length > 0) {
      if (y > 220) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Domínios DNS Acessados', 14, y);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['Domínio', 'Status']],
        body: data.domains.slice(0, 30).map(d => [
          d.domain, d.is_blocked ? '🚫 Bloqueado' : '✅ Permitido',
        ]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // === ALERTS ===
    if (data.alerts.length > 0) {
      if (y > 220) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Alertas de Segurança', 14, y);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['Data', 'Severidade', 'Título', 'Mensagem']],
        body: data.alerts.map(a => [
          new Date(a.created_at).toLocaleString('pt-BR'),
          a.severity.toUpperCase(),
          a.title?.substring(0, 40) || '-',
          a.message?.substring(0, 60) || '-',
        ]),
        theme: 'striped',
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        margin: { left: 14, right: 14 },
        didParseCell: (hookData: any) => {
          if (hookData.column.index === 1 && hookData.section === 'body') {
            const val = String(hookData.cell.raw);
            if (val === 'CRITICAL') hookData.cell.styles.textColor = [220, 20, 60];
            else if (val === 'HIGH') hookData.cell.styles.textColor = [245, 158, 11];
          }
        },
      });
    }

    // Footer
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      const ph = doc.internal.pageSize.getHeight();
      doc.text('CyberShield — Relatório Forense Confidencial', 14, ph - 8);
      doc.text(`Página ${p}/${totalPages}`, pageWidth - 14, ph - 8, { align: 'right' });
    }
  }

  // Save
  const filename = isMultiple
    ? `relatorio-forense-grupo-${now.toISOString().slice(0, 10)}.pdf`
    : `relatorio-forense-${agentIds[0].slice(0, 8)}-${now.toISOString().slice(0, 10)}.pdf`;

  doc.save(filename);
}
