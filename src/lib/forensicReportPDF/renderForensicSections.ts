/**
 * Forensic Report PDF section renderers.
 */
import { addLogoToPDF } from '@/lib/pdfLogoHelper';
import type { ForensicData } from './types';

const BLUE: [number, number, number] = [59, 130, 246];
const AMBER: [number, number, number] = [245, 158, 11];
const RED: [number, number, number] = [220, 38, 38];

function getVerdictLabel(v: ForensicData['verdict']) {
  if (v === 'clean') return '✅ LIMPO — Nenhuma ameaça detectada';
  if (v === 'suspicious') return '⚠️ SUSPEITO — Investigação recomendada';
  return '🔴 COMPROMETIDO — Ação imediata necessária';
}

function getVerdictColor(v: ForensicData['verdict']): [number, number, number] {
  if (v === 'clean') return [34, 139, 34];
  if (v === 'suspicious') return [255, 165, 0];
  return [220, 20, 60];
}

interface Ctx {
  doc: any;
  autoTable: any;
  y: number;
  pageWidth: number;
}

function checkPage(ctx: Ctx, threshold = 240) {
  if (ctx.y > threshold) { ctx.doc.addPage(); ctx.y = 15; }
}

export function renderHeader(ctx: Ctx, logoDataUrl: string | null, now: Date, isMultiple: boolean, idx: number, total: number) {
  const { doc, pageWidth } = ctx;
  addLogoToPDF(doc, logoDataUrl, 20, ctx.y, 14);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text('Relatório de Investigação Forense', pageWidth / 2, ctx.y + 8, { align: 'center' });
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
  doc.text(`Gerado em: ${now.toLocaleString('pt-BR')}`, pageWidth / 2, ctx.y + 14, { align: 'center' });
  if (isMultiple) {
    doc.text(`Máquina ${idx + 1} de ${total}`, pageWidth / 2, ctx.y + 19, { align: 'center' });
    ctx.y += 24;
  } else {
    ctx.y += 20;
  }
  doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.8);
  doc.line(14, ctx.y, pageWidth - 14, ctx.y);
  ctx.y += 6;
}

export function renderVerdict(ctx: Ctx, data: ForensicData) {
  const [vr, vg, vb] = getVerdictColor(data.verdict);
  ctx.doc.setFillColor(vr, vg, vb);
  ctx.doc.roundedRect(14, ctx.y, ctx.pageWidth - 28, 14, 2, 2, 'F');
  ctx.doc.setFontSize(12); ctx.doc.setFont('helvetica', 'bold'); ctx.doc.setTextColor(255, 255, 255);
  ctx.doc.text(getVerdictLabel(data.verdict), ctx.pageWidth / 2, ctx.y + 9, { align: 'center' });
  ctx.y += 20;
}

export function renderAgentInfo(ctx: Ctx, data: ForensicData) {
  const { doc, autoTable } = ctx;
  doc.setTextColor(30, 30, 30); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Informações do Agente', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y,
    head: [['Campo', 'Valor']],
    body: [
      ['Nome', data.agent.agent_name], ['Hostname', data.agent.hostname],
      ['Versão', data.agent.agent_version], ['SO', `${data.agent.os_type} ${data.agent.os_version}`],
      ['Estado', data.agent.agent_state], ['Status', data.agent.status],
      ['Isolado', data.agent.is_isolated ? 'SIM' : 'Não'],
      ['Último Heartbeat', new Date(data.agent.last_heartbeat).toLocaleString('pt-BR')],
    ],
    theme: 'striped', styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BLUE, textColor: 255 }, margin: { left: 14, right: 14 },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderVerdictDetails(ctx: Ctx, data: ForensicData) {
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Detalhes do Veredicto', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y, body: data.verdictDetails.map(d => [d]),
    theme: 'plain', styles: { fontSize: 8, cellPadding: 2 }, margin: { left: 14, right: 14 },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderProcesses(ctx: Ctx, data: ForensicData) {
  checkPage(ctx);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text(`Processos Ativos (${data.processes.length} total)`, 14, ctx.y);
  ctx.y += 5;
  const topProcs = [...data.processes].sort((a, b) => b.cpu_percent - a.cpu_percent).slice(0, 15);
  autoTable(doc, {
    startY: ctx.y,
    head: [['PID', 'Nome', 'CPU %', 'RAM (MB)', 'Usuário']],
    body: topProcs.map(p => [p.pid, p.name, p.cpu_percent?.toFixed(1) || '0', p.memory_mb?.toFixed(0) || '0', p.user || '-']),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: BLUE, textColor: 255 }, margin: { left: 14, right: 14 },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderSuspiciousProcesses(ctx: Ctx, data: ForensicData) {
  if (data.suspiciousProcesses.length === 0) return;
  checkPage(ctx);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Processos Flagrados', 14, ctx.y);
  ctx.y += 2;
  doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
  doc.text('Nota: Muitos são falsos positivos (processos do Windows em pastas temporárias)', 14, ctx.y + 3);
  doc.setTextColor(30, 30, 30);
  ctx.y += 6;
  autoTable(doc, {
    startY: ctx.y,
    head: [['Horário', 'Processos']],
    body: data.suspiciousProcesses.map(row => [row[0], row.slice(1).join(', ')]),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: AMBER, textColor: 255 }, margin: { left: 14, right: 14 },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderNetworkSummary(ctx: Ctx, data: ForensicData) {
  if (data.networkSummary.length === 0) return;
  checkPage(ctx, 220);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Resumo de Rede por Processo', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y,
    head: [['Processo', 'Conexões', 'IPs Únicos', 'Risco']],
    body: data.networkSummary.slice(0, 15).map(ns => {
      let risk = 'Normal';
      const lp = ns.proc.toLowerCase();
      if (['powershell', 'cmd', 'wscript', 'cscript', 'mshta'].includes(lp)) risk = 'Verificar';
      if (['lsass', 'csrss'].includes(lp)) risk = 'Atenção';
      return [ns.proc, ns.count, ns.uniqueIps, risk];
    }),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: BLUE, textColor: 255 }, margin: { left: 14, right: 14 },
    didParseCell: (hookData: any) => {
      if (hookData.column.index === 3 && hookData.section === 'body') {
        const val = hookData.cell.raw;
        if (val === 'Atenção') hookData.cell.styles.textColor = [220, 20, 60];
        else if (val === 'Verificar') hookData.cell.styles.textColor = AMBER;
        else hookData.cell.styles.textColor = [34, 139, 34];
      }
    },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderNonStandardPorts(ctx: Ctx, data: ForensicData) {
  if (data.nonStandardPorts.length === 0) return;
  checkPage(ctx, 230);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Conexões em Portas Não-Padrão', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y,
    head: [['IP Remoto', 'Porta', 'Processo']],
    body: data.nonStandardPorts.map(np => [np.ip, np.port, np.proc]),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: AMBER, textColor: 255 }, margin: { left: 14, right: 14 },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderFileEvents(ctx: Ctx, data: ForensicData) {
  if (data.fileEvents.length === 0) return;
  checkPage(ctx, 230);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Atividade de Arquivos', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y,
    head: [['Tipo', 'Caminho', 'Processo', 'Suspeito']],
    body: data.fileEvents.slice(0, 20).map(fe => [
      fe.event_type, fe.file_path?.substring(0, 60) || '-',
      fe.process_name || '-', fe.is_suspicious ? 'SIM' : 'Não',
    ]),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: BLUE, textColor: 255 }, margin: { left: 14, right: 14 },
    columnStyles: { 1: { cellWidth: 80 } },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderDomains(ctx: Ctx, data: ForensicData) {
  if (data.domains.length === 0) return;
  checkPage(ctx, 220);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Domínios DNS Acessados', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y,
    head: [['Domínio', 'Status']],
    body: data.domains.slice(0, 30).map(d => [d.domain, d.is_blocked ? '🚫 Bloqueado' : '✅ Permitido']),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: BLUE, textColor: 255 }, margin: { left: 14, right: 14 },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export function renderAlerts(ctx: Ctx, data: ForensicData) {
  if (data.alerts.length === 0) return;
  checkPage(ctx, 220);
  const { doc, autoTable } = ctx;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Alertas de Segurança', 14, ctx.y);
  ctx.y += 5;
  autoTable(doc, {
    startY: ctx.y,
    head: [['Data', 'Severidade', 'Título', 'Mensagem']],
    body: data.alerts.map(a => [
      new Date(a.created_at).toLocaleString('pt-BR'),
      a.severity.toUpperCase(),
      a.title?.substring(0, 40) || '-',
      a.message?.substring(0, 60) || '-',
    ]),
    theme: 'striped', styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: RED, textColor: 255 }, margin: { left: 14, right: 14 },
    didParseCell: (hookData: any) => {
      if (hookData.column.index === 1 && hookData.section === 'body') {
        const val = String(hookData.cell.raw);
        if (val === 'CRITICAL') hookData.cell.styles.textColor = [220, 20, 60];
        else if (val === 'HIGH') hookData.cell.styles.textColor = AMBER;
      }
    },
  });
}

export function renderFooters(ctx: Ctx, pageWidth: number) {
  const { doc } = ctx;
  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    const ph = doc.internal.pageSize.getHeight();
    doc.text('CyberShield — Relatório Forense Confidencial', 14, ph - 8);
    doc.text(`Página ${p}/${totalPages}`, pageWidth - 14, ph - 8, { align: 'right' });
  }
}
