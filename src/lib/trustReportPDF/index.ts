/**
 * CyberShield Trust Report PDF Generator (modularized)
 */
import { loadLogoForPDF } from '@/lib/pdfLogoHelper';
import { collectTrustData } from './collectTrustData';
import {
  renderCoverPage, renderExecutiveSummary, renderFleetSection,
  renderDetectionSection, renderThreatIntelSection, renderAlertsSection,
  renderAuditSection, renderComplianceSection, renderCoverageGatesSection,
  renderGuaranteesSection, renderSignature,
} from './renderSections';
import type { RenderCtx } from './renderSections';

export async function generateTrustReportPDF(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }, logoData, data] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    loadLogoForPDF(),
    collectTrustData(tenantId, startDate, endDate),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 15;

  const ctx: RenderCtx = { doc, autoTable, y: margin, W, H, margin, data, logoData };

  renderCoverPage(ctx);
  renderExecutiveSummary(ctx);
  renderFleetSection(ctx);
  renderDetectionSection(ctx);
  renderThreatIntelSection(ctx);
  renderAlertsSection(ctx);
  renderAuditSection(ctx);
  renderComplianceSection(ctx);
  renderCoverageGatesSection(ctx);
  renderGuaranteesSection(ctx);
  await renderSignature(ctx);

  const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR');
  const fileName = `CyberShield_TrustReport_${data.tenant.slug}_${fmtDate(startDate).replace(/\//g, '-')}_${fmtDate(endDate).replace(/\//g, '-')}.pdf`;
  doc.save(fileName);
}
