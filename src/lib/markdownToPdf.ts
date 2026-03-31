/**
 * Professional PDF generator from Markdown content using jsPDF.
 * Decomposed into: pdf/constants.ts, pdf/page-layout.ts, pdf/content-renderers.ts
 */

import { loadLogoForPDF } from './pdfLogoHelper';
import { COLORS, newPage, wrapText, sanitizeForPdf, type PDFContext } from './pdf/constants';
import { renderCoverPage, renderHeader, renderFooter, renderTableOfContents } from './pdf/page-layout';
import { renderMarkdownContent } from './pdf/content-renderers';

function createContext(doc: any, title: string, logoDataUrl: string | null): PDFContext {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  return {
    doc, y: 16, pageHeight, pageWidth,
    marginLeft: 18, marginRight: 18, marginTop: 16, marginBottom: 16,
    contentWidth: pageWidth - 36, pageNumber: 1, title, logoDataUrl,
  };
}

function applyHeadersFooters(ctx: PDFContext): void {
  const totalPages = (ctx.doc as unknown as { getNumberOfPages(): number }).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    ctx.doc.setPage(p);
    if (p === 1) continue;
    renderHeader(ctx);
    renderFooter(ctx, p - 1, totalPages - 1);
  }
}

export async function generatePDFFromMarkdown(title: string, markdownContent: string): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const logoDataUrl = await loadLogoForPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ctx = createContext(doc, title, logoDataUrl);

  renderCoverPage(ctx, title);
  newPage(ctx);
  ctx.y = ctx.marginTop + 4;
  renderMarkdownContent(ctx, markdownContent);
  applyHeadersFooters(ctx);

  return doc.output('blob');
}

export async function generateConsolidatedPDF(
  documents: { title: string; category: string; content: string }[]
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const logoDataUrl = await loadLogoForPDF();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ctx = createContext(doc, 'Documentação Completa', logoDataUrl);

  renderCoverPage(ctx, 'Documentação Completa de Governança, Segurança e Operações', documents.length);
  renderTableOfContents(ctx, documents);

  for (const docItem of documents) {
    newPage(ctx);
    ctx.y = ctx.marginTop + 4;

    // Category badge
    doc.setFillColor(...COLORS.brandLight);
    doc.setDrawColor(...COLORS.brand);
    const catText = docItem.category.toUpperCase();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const catWidth = doc.getTextWidth(catText) + 6;
    doc.roundedRect(ctx.marginLeft, ctx.y - 4, catWidth, 6, 1.5, 1.5, 'FD');
    doc.setTextColor(...COLORS.brand);
    doc.text(catText, ctx.marginLeft + 3, ctx.y);
    ctx.y += 8;

    // Document title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.heading);
    const titleLines = wrapText(doc, docItem.title, ctx.contentWidth);
    titleLines.forEach((tl: string) => { doc.text(tl, ctx.marginLeft, ctx.y); ctx.y += 8; });

    // Accent line
    doc.setDrawColor(...COLORS.brand);
    doc.setLineWidth(0.8);
    doc.line(ctx.marginLeft, ctx.y, ctx.marginLeft + 40, ctx.y);
    ctx.y += 8;

    renderMarkdownContent(ctx, docItem.content);
  }

  applyHeadersFooters(ctx);
  return doc.output('blob');
}
