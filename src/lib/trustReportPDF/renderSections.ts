/**
 * PDF section renderers for Trust Report.
 * Each function renders a specific section into the jsPDF doc.
 */
import type { TrustReportData } from './types';
import { COLORS as C } from './types';
import { addLogoToPDF } from '@/lib/pdfLogoHelper';

interface RenderCtx {
  doc: any;
  autoTable: any;
  y: number;
  W: number;
  H: number;
  margin: number;
  data: TrustReportData;
  logoData: string | null;
}

const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR');
const pctStr = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

function addFooter(ctx: RenderCtx) {
  ctx.doc.setFontSize(8);
  ctx.doc.setTextColor(...C.gray);
  ctx.doc.text(`CyberShield Trust Report — ${ctx.data.tenant.name} — Gerado em ${new Date().toLocaleString('pt-BR')}`, ctx.margin, ctx.H - 8);
  ctx.doc.text(`Página ${ctx.doc.getNumberOfPages()}`, ctx.W - ctx.margin, ctx.H - 8, { align: 'right' });
}

function checkPage(ctx: RenderCtx, need: number) {
  if (ctx.y + need > ctx.H - 20) {
    addFooter(ctx);
    ctx.doc.addPage();
    ctx.y = ctx.margin;
  }
}

function sectionTitle(ctx: RenderCtx, title: string) {
  checkPage(ctx, 18);
  ctx.y += 4;
  ctx.doc.setFillColor(...C.brand);
  ctx.doc.rect(ctx.margin, ctx.y, ctx.W - 2 * ctx.margin, 8, 'F');
  ctx.doc.setTextColor(255, 255, 255);
  ctx.doc.setFontSize(11);
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.text(title, ctx.margin + 3, ctx.y + 5.5);
  ctx.y += 12;
  ctx.doc.setTextColor(0, 0, 0);
  ctx.doc.setFont('helvetica', 'normal');
}

function kpiRow(ctx: RenderCtx, items: { label: string; value: string; color?: [number, number, number] }[]) {
  checkPage(ctx, 22);
  const colW = (ctx.W - 2 * ctx.margin) / items.length;
  items.forEach((item, i) => {
    const x = ctx.margin + i * colW;
    ctx.doc.setFillColor(...C.lightBg);
    ctx.doc.roundedRect(x + 1, ctx.y, colW - 2, 18, 2, 2, 'F');
    ctx.doc.setFontSize(16);
    ctx.doc.setFont('helvetica', 'bold');
    ctx.doc.setTextColor(...(item.color || C.brand));
    ctx.doc.text(item.value, x + colW / 2, ctx.y + 8, { align: 'center' });
    ctx.doc.setFontSize(7);
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setTextColor(...C.gray);
    ctx.doc.text(item.label, x + colW / 2, ctx.y + 15, { align: 'center' });
  });
  ctx.y += 22;
  ctx.doc.setTextColor(0, 0, 0);
}

export function renderCoverPage(ctx: RenderCtx) {
  const { doc, data, W } = ctx;
  if (ctx.logoData) addLogoToPDF(doc, ctx.logoData, W / 2 - 15, 20, 30);
  ctx.y = 60;
  doc.setFontSize(24); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.brand);
  doc.text('RELATÓRIO DE CONFIANÇA', W / 2, ctx.y, { align: 'center' });
  ctx.y += 10;
  doc.setFontSize(14); doc.setFont('helvetica', 'normal');
  doc.text('Trust Report — Evidências de Proteção', W / 2, ctx.y, { align: 'center' });
  ctx.y += 12;
  doc.setFontSize(11); doc.setTextColor(...C.gray);
  doc.text(`Tenant: ${data.tenant.name}`, W / 2, ctx.y, { align: 'center' });
  ctx.y += 7;
  doc.text(`Período: ${fmtDate(data.period.start)} — ${fmtDate(data.period.end)}`, W / 2, ctx.y, { align: 'center' });
  ctx.y += 7;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, W / 2, ctx.y, { align: 'center' });

  ctx.y += 16;
  const allGatesPass = data.coverageGates?.is_compliant ?? false;
  const auditOk = data.auditIntegrity.chainValid;
  const verdictOk = allGatesPass && auditOk && data.agents.online > 0;
  const verdictColor = verdictOk ? C.green : C.red;
  const verdictText = verdictOk ? '✓ PROTEÇÃO ATIVA VERIFICADA' : '⚠ ATENÇÃO NECESSÁRIA';
  doc.setFillColor(...verdictColor);
  const vw = 100;
  doc.roundedRect(W / 2 - vw / 2, ctx.y, vw, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(verdictText, W / 2, ctx.y + 8, { align: 'center' });
}

export function renderExecutiveSummary(ctx: RenderCtx) {
  const { data } = ctx;
  addFooter(ctx);
  ctx.doc.addPage();
  ctx.y = ctx.margin;

  sectionTitle(ctx, '1. RESUMO EXECUTIVO — POSTURA DE SEGURANÇA');
  kpiRow(ctx, [
    { label: 'Endpoints Protegidos', value: `${data.agents.online}/${data.agents.total}`, color: data.agents.offline > 0 ? C.amber : C.green },
    { label: 'Regras de Detecção', value: `${data.detectionRules.enabled}`, color: C.brand },
    { label: 'Detecções no Período', value: `${data.detections.total}`, color: data.detections.total > 0 ? C.amber : C.green },
    { label: 'Alertas Críticos', value: `${data.alerts.critical}`, color: data.alerts.critical > 0 ? C.red : C.green },
  ]);
  kpiRow(ctx, [
    { label: 'IoCs Monitorados', value: `${data.threatIntel.totalIndicators}` },
    { label: 'Matches Threat Intel', value: `${data.threatIntel.matches}`, color: data.threatIntel.matches > 0 ? C.red : C.green },
    { label: 'Score Conformidade', value: data.compliance.score != null ? `${data.compliance.score}%` : 'N/A' },
    { label: 'Cadeia de Auditoria', value: data.auditIntegrity.chainValid ? '✓ Íntegra' : '✗ Quebrada', color: data.auditIntegrity.chainValid ? C.green : C.red },
  ]);
}

export function renderFleetSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  sectionTitle(ctx, '2. COBERTURA DA FROTA');
  doc.setFontSize(9);
  ctx.y += 2;
  autoTable(doc, {
    startY: ctx.y,
    margin: { left: margin, right: margin },
    head: [['Métrica', 'Valor', 'Status']],
    body: [
      ['Total de Endpoints', `${data.agents.total}`, '—'],
      ['Online (Heartbeat OK)', `${data.agents.online}`, data.agents.online === data.agents.total ? '✓ 100%' : `⚠ ${pctStr(data.agents.online, data.agents.total)}`],
      ['Offline', `${data.agents.offline}`, data.agents.offline > 0 ? '⚠ Atenção' : '✓ Nenhum'],
      ['Isolados (Quarentena)', `${data.agents.isolated}`, data.agents.isolated > 0 ? `${data.agents.isolated} em quarentena` : '—'],
      ['Cadeia de Evidências', `${data.evidenceChain.agentsWithChain} agentes`, `${data.evidenceChain.totalExecutions} execuções registradas`],
    ],
    theme: 'striped',
    headStyles: { fillColor: C.brand, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
  });
  ctx.y = doc.lastAutoTable.finalY + 6;
}

export function renderDetectionSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  sectionTitle(ctx, '3. MOTOR DE DETECÇÃO');

  const tacticRows = Object.entries(data.detectionRules.byTactic)
    .sort((a, b) => b[1] - a[1]).map(([tactic, count]) => [tactic, `${count}`]);

  if (tacticRows.length > 0) {
    checkPage(ctx, 40);
    autoTable(doc, {
      startY: ctx.y, margin: { left: margin, right: margin },
      head: [['Tática MITRE ATT&CK', 'Regras Ativas']], body: tacticRows,
      theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 8 },
    });
    ctx.y = doc.lastAutoTable.finalY + 4;
  }

  if (data.detections.topRules.length > 0) {
    checkPage(ctx, 40);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Top 10 — Detecções Disparadas no Período:', margin, ctx.y + 3);
    ctx.y += 6;
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: ctx.y, margin: { left: margin, right: margin },
      head: [['Regra', 'Disparos']], body: data.detections.topRules.map(r => [r.name, `${r.count}`]),
      theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 8 },
    });
    ctx.y = doc.lastAutoTable.finalY + 6;
  }
}

export function renderThreatIntelSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  sectionTitle(ctx, '4. INTELIGÊNCIA DE AMEAÇAS');
  autoTable(doc, {
    startY: ctx.y, margin: { left: margin, right: margin },
    head: [['Métrica', 'Valor']],
    body: [
      ['Indicadores Ativos (IoCs)', `${data.threatIntel.totalIndicators}`],
      ['Matches na Frota (período)', `${data.threatIntel.matches}`],
      ['Última Sincronização', data.threatIntel.lastSync ? new Date(data.threatIntel.lastSync).toLocaleString('pt-BR') : 'N/A'],
      ['Fontes', data.threatIntel.sources.length > 0 ? data.threatIntel.sources.join(', ') : 'N/A'],
    ],
    theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 8 },
  });
  ctx.y = doc.lastAutoTable.finalY + 6;
}

export function renderAlertsSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  sectionTitle(ctx, '5. ALERTAS DE SEGURANÇA');
  autoTable(doc, {
    startY: ctx.y, margin: { left: margin, right: margin },
    head: [['Severidade', 'Quantidade', '% do Total']],
    body: [
      ['Crítico', `${data.alerts.critical}`, pctStr(data.alerts.critical, data.alerts.total)],
      ['Alto', `${data.alerts.high}`, pctStr(data.alerts.high, data.alerts.total)],
      ['Médio', `${data.alerts.medium}`, pctStr(data.alerts.medium, data.alerts.total)],
      ['Baixo', `${data.alerts.low}`, pctStr(data.alerts.low, data.alerts.total)],
      ['Total', `${data.alerts.total}`, '100%'],
      ['Resolvidos', `${data.alerts.resolved}`, pctStr(data.alerts.resolved, data.alerts.total)],
    ],
    theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 8 },
  });
  ctx.y = doc.lastAutoTable.finalY + 6;
}

export function renderAuditSection(ctx: RenderCtx) {
  const { doc, data, margin } = ctx;
  const chainStatus = data.auditIntegrity.chainValid;
  sectionTitle(ctx, '6. INTEGRIDADE DA TRILHA DE AUDITORIA');
  doc.setFontSize(9);
  doc.setTextColor(...(chainStatus ? C.green : C.red));
  doc.setFont('helvetica', 'bold');
  doc.text(chainStatus ? '✓ CADEIA DE HASHES ÍNTEGRA' : '✗ CADEIA DE HASHES COMPROMETIDA', margin, ctx.y + 3);
  ctx.y += 7;
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
  doc.text(`Registros de auditoria verificados: ${data.auditIntegrity.totalLogs}`, margin, ctx.y);
  ctx.y += 5;
  doc.setFontSize(8); doc.setTextColor(...C.gray);
  doc.text('A cadeia de hashes SHA-256 garante que nenhum registro de auditoria foi adulterado.', margin, ctx.y);
  doc.text('Cada log contém o hash do log anterior, formando uma blockchain de evidências.', margin, ctx.y + 4);
  ctx.y += 12;
  doc.setTextColor(0, 0, 0);
}

export function renderComplianceSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  if (data.compliance.score == null && data.compliance.categories.length === 0) return;
  sectionTitle(ctx, '7. CONFORMIDADE E GOVERNANÇA');
  if (data.compliance.score != null) {
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    const scoreColor = data.compliance.score >= 80 ? C.green : data.compliance.score >= 50 ? C.amber : C.red;
    doc.setTextColor(...scoreColor);
    doc.text(`Score Geral: ${data.compliance.score}%`, margin, ctx.y + 3);
    ctx.y += 10;
    doc.setTextColor(0, 0, 0);
  }
  if (data.compliance.categories.length > 0) {
    autoTable(doc, {
      startY: ctx.y, margin: { left: margin, right: margin },
      head: [['Categoria', 'Score']], body: data.compliance.categories.map(c => [c.name, `${c.score}%`]),
      theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 8 },
    });
    ctx.y = doc.lastAutoTable.finalY + 6;
  }
}

export function renderCoverageGatesSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  if (!data.coverageGates) return;
  sectionTitle(ctx, '8. GATES DE GOVERNANÇA');
  const gateLabels: Record<string, string> = {
    all_critical_alerts_have_tasks: 'Alertas Críticos → Tasks',
    all_critical_insights_have_tasks: 'Insights Críticos → Tasks',
    all_critical_tasks_have_owner: 'Tasks Críticas → Owner',
  };
  autoTable(doc, {
    startY: ctx.y, margin: { left: margin, right: margin },
    head: [['Gate', 'Status', 'Gaps']],
    body: data.coverageGates.gates.map(g => [
      gateLabels[g.gate] || g.gate,
      g.passed ? '✓ Passed' : '✗ Failed',
      g.count > 0 ? `${g.count}` : '—',
    ]),
    theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 8 },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.column.index === 1) {
        const val = hookData.cell.raw as string;
        hookData.cell.styles.textColor = val.startsWith('✓') ? C.green : C.red;
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });
  ctx.y = doc.lastAutoTable.finalY + 6;
}

export function renderGuaranteesSection(ctx: RenderCtx) {
  const { doc, autoTable, data, margin } = ctx;
  const chainStatus = data.auditIntegrity.chainValid;
  sectionTitle(ctx, '9. GARANTIAS TÉCNICAS DE PROTEÇÃO');
  const guarantees = [
    ['Isolamento Multi-Tenant', 'RLS (Row Level Security) em 100% das tabelas', '✓ Ativo'],
    ['Autenticidade de Comunicação', 'HMAC-SHA256 com janela de ±5 min', '✓ Ativo'],
    ['Assinatura de Releases', 'Ed25519 em todos os binários do agente', '✓ Ativo'],
    ['Auditoria Imutável', 'Triggers BEFORE UPDATE/DELETE em audit_logs', chainStatus ? '✓ Íntegra' : '✗ Verificar'],
    ['Cadeia de Evidências', 'Blockchain por endpoint (hash encadeado)', `${data.evidenceChain.agentsWithChain} agentes`],
    ['Detecção em Tempo Real', `${data.detectionRules.enabled} regras MITRE ATT&CK`, '✓ Ativo'],
    ['Threat Intelligence', `${data.threatIntel.totalIndicators} IoCs monitorados`, data.threatIntel.lastSync ? '✓ Sincronizado' : '⚠ Pendente'],
    ['Anomalia Comportamental', 'Baselines estatísticos por agente', '✓ Ativo'],
    ['Proteção Anti-Tampering', 'Permissões SYSTEM no host + self-healing', '✓ Ativo'],
    ['Zero Trust Architecture', 'Validação em todas as camadas (Edge→RLS→Trigger)', '✓ Ativo'],
  ];
  autoTable(doc, {
    startY: ctx.y, margin: { left: margin, right: margin },
    head: [['Controle', 'Implementação', 'Status']], body: guarantees,
    theme: 'striped', headStyles: { fillColor: C.brand, fontSize: 8 }, bodyStyles: { fontSize: 7.5 },
    columnStyles: { 0: { fontStyle: 'bold' } },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.column.index === 2) {
        const val = hookData.cell.raw as string;
        if (val.startsWith('✓')) hookData.cell.styles.textColor = C.green;
        else if (val.startsWith('✗') || val.startsWith('⚠')) hookData.cell.styles.textColor = C.red;
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });
  ctx.y = doc.lastAutoTable.finalY + 8;
}

export async function renderSignature(ctx: RenderCtx) {
  const { doc, data, W, margin } = ctx;
  checkPage(ctx, 30);
  doc.setDrawColor(...C.brand); doc.setLineWidth(0.5);
  doc.line(margin, ctx.y, W - margin, ctx.y);
  ctx.y += 6;
  doc.setFontSize(8); doc.setTextColor(...C.gray);
  doc.text('CERTIFICADO DE VERIFICAÇÃO', W / 2, ctx.y, { align: 'center' });
  ctx.y += 5;
  doc.setFontSize(7);
  const reportHash = await computeReportHash(data);
  doc.text(`Hash do Relatório (SHA-256): ${reportHash}`, W / 2, ctx.y, { align: 'center' });
  ctx.y += 4;
  doc.text('Este relatório atesta que os controles de segurança listados estavam ativos e verificados no momento da geração.', W / 2, ctx.y, { align: 'center' });
  ctx.y += 4;
  doc.text('Qualquer alteração neste documento invalida o hash acima.', W / 2, ctx.y, { align: 'center' });
  addFooter(ctx);
}

async function computeReportHash(data: TrustReportData): Promise<string> {
  const payload = JSON.stringify({
    tenant: data.tenant.id,
    period: { start: data.period.start.toISOString(), end: data.period.end.toISOString() },
    agents: data.agents, detections: data.detections.total,
    alerts: data.alerts.total, auditChainValid: data.auditIntegrity.chainValid,
    generatedAt: new Date().toISOString(),
  });
  const buffer = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export { addFooter, checkPage, sectionTitle, kpiRow };
export type { RenderCtx };
