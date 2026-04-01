import { formatBytes } from '@/hooks/useEvidenceBundle';
import type { ExportResult } from './constants';

export async function generatePDF(
  bundleData: Record<string, unknown>,
  result: ExportResult,
  logoDataUrl?: string | null
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header with logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', pageWidth / 2 - 10, 4, 20, 20);
    } catch { /* fallback below */ }
  }
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Evidence Bundle', pageWidth / 2, 28, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Pacote de Evidências Criptograficamente Verificável', pageWidth / 2, 35, { align: 'center' });

  // Separator line
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(20, 36, pageWidth - 20, 36);

  // Metadata section
  let y = 45;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Informações do Bundle', 20, y);
  y += 8;

  const metadata = (bundleData.metadata ?? {}) as Record<string, unknown>;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const metaRows = [
    ['Audit ID', result.auditId],
    ['Data de Geração', new Date().toLocaleString('pt-BR')],
    ['Período', `${metadata.periodStart ? new Date(metadata.periodStart as string).toLocaleDateString('pt-BR') : '—'} até ${metadata.periodEnd ? new Date(metadata.periodEnd as string).toLocaleDateString('pt-BR') : '—'}`],
    ['Tipo', metadata.bundleType as string || '—'],
    ['Total de Registros', String(result.recordCount)],
    ['Tamanho', formatBytes(result.sizeBytes)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Campo', 'Valor']],
    body: metaRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    margin: { left: 20, right: 20 },
  });

  y = doc.lastAutoTable.finalY + 12;

  // Integrity section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Verificação de Integridade', 20, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('SHA-256 Manifest Hash:', 20, y);
  y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.text(result.manifestHash, 20, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Para verificar a integridade deste bundle:', 20, y);
  y += 6;
  doc.text('1. Calcule o SHA-256 do arquivo JSON correspondente', 24, y);
  y += 5;
  doc.text('2. Compare com o hash acima — devem ser idênticos', 24, y);
  y += 5;
  doc.text('3. Qualquer divergência indica alteração após a exportação', 24, y);
  y += 12;

  // Evidence summary
  const evidence = (bundleData.evidence ?? {}) as Record<string, unknown[]>;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo das Evidências', 20, y);
  y += 8;

  const countItems = (key: string): string => String(Array.isArray(evidence[key]) ? evidence[key].length : 0);
  const summaryRows: string[][] = [];
  if (evidence.securityEvents) summaryRows.push(['Eventos de Segurança', countItems('securityEvents')]);
  if (evidence.jobs) summaryRows.push(['Jobs Executados', countItems('jobs')]);
  if (evidence.signedExecutions) summaryRows.push(['Execuções Assinadas', countItems('signedExecutions')]);
  if (evidence.hashChain) summaryRows.push(['Cadeia de Hash', evidence.hashChain ? '1 (ativa)' : '0']);
  if (evidence.riskDecisions) summaryRows.push(['Decisões de Risco', countItems('riskDecisions')]);
  if (evidence.playbookExecutions) summaryRows.push(['Execuções de Playbook', countItems('playbookExecutions')]);
  if (evidence.auditLogs) summaryRows.push(['Logs de Auditoria', countItems('auditLogs')]);

  if (summaryRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Tipo de Evidência', 'Registros']],
      body: summaryRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      styles: { fontSize: 9 },
      margin: { left: 20, right: 20 },
    });
  }

  // Footer on each page
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(128);
    doc.text(
      `CyberShield Evidence Bundle — Audit ID: ${result.auditId} — Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.setTextColor(0);
  }

  return doc;
}
