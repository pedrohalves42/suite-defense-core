/**
 * Forensic Investigation Report PDF Generator (modularized)
 */
import { loadLogoForPDF } from '@/lib/pdfLogoHelper';
import { fetchForensicData } from './fetchForensicData';
import {
  renderHeader, renderVerdict, renderAgentInfo, renderVerdictDetails,
  renderProcesses, renderSuspiciousProcesses, renderNetworkSummary,
  renderNonStandardPorts, renderFileEvents, renderDomains, renderAlerts,
  renderFooters,
} from './renderForensicSections';

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
    const ctx = { doc, autoTable, y: 15, pageWidth };

    renderHeader(ctx, logoDataUrl, now, isMultiple, idx, agentIds.length);
    renderVerdict(ctx, data);
    renderAgentInfo(ctx, data);
    renderVerdictDetails(ctx, data);
    renderProcesses(ctx, data);
    renderSuspiciousProcesses(ctx, data);
    renderNetworkSummary(ctx, data);
    renderNonStandardPorts(ctx, data);
    renderFileEvents(ctx, data);
    renderDomains(ctx, data);
    renderAlerts(ctx, data);
  }

  renderFooters({ doc, autoTable, y: 0, pageWidth }, pageWidth);

  const filename = isMultiple
    ? `relatorio-forense-grupo-${now.toISOString().slice(0, 10)}.pdf`
    : `relatorio-forense-${agentIds[0].slice(0, 8)}-${now.toISOString().slice(0, 10)}.pdf`;

  doc.save(filename);
}
