/**
 * PDF Page Layout — Cover page, header, footer, table of contents
 */
import { addLogoToPDF } from '../pdfLogoHelper';
import { COLORS, sanitizeForPdf, wrapText, newPage, checkPageBreak, type PDFContext } from './constants';

export function renderHeader(ctx: PDFContext): void {
  const { doc, pageWidth, marginLeft, marginRight } = ctx;
  doc.setDrawColor(...COLORS.brand);
  doc.setLineWidth(0.8);
  doc.line(0, 0, pageWidth, 0);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMuted);
  doc.text('CYBERSHIELD', marginLeft, 8);
  doc.setDrawColor(...COLORS.tableBorder);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, 10, pageWidth - marginRight, 10);
}

export function renderFooter(ctx: PDFContext, pageNum: number, totalPages: number): void {
  const { doc, pageWidth, pageHeight, marginLeft, marginRight } = ctx;
  const footerY = pageHeight - 8;
  doc.setDrawColor(...COLORS.tableBorder);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, footerY - 4, pageWidth - marginRight, footerY - 4);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMuted);
  const footerTitle = ctx.title.length > 50 ? ctx.title.substring(0, 47) + '...' : ctx.title;
  doc.text(footerTitle, marginLeft, footerY);
  doc.setFont('helvetica', 'bold');
  doc.text('CONFIDENCIAL', pageWidth / 2, footerY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(`${pageNum} / ${totalPages}`, pageWidth - marginRight, footerY, { align: 'right' });
}

export function renderCoverPage(ctx: PDFContext, subtitle?: string, docCount?: number): void {
  const { doc, pageWidth, pageHeight } = ctx;
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 8, pageHeight, 'F');
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, pageWidth, 3, 'F');
  const logoY = 55;
  addLogoToPDF(doc, ctx.logoDataUrl, pageWidth / 2, logoY, 28);
  let y = logoY + 38;
  doc.setFontSize(34);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.heading);
  doc.text('CyberShield', pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.setDrawColor(...COLORS.brand);
  doc.setLineWidth(1);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 12;
  if (subtitle) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    const subLines = wrapText(doc, sanitizeForPdf(subtitle), 140);
    subLines.forEach((sl: string) => { doc.text(sl, pageWidth / 2, y, { align: 'center' }); y += 8; });
  }
  if (docCount) {
    y += 5;
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(`${docCount} documentos`, pageWidth / 2, y, { align: 'center' });
  }
  const boxY = pageHeight - 50;
  doc.setFillColor(...COLORS.brandLight);
  doc.roundedRect(pageWidth / 2 - 50, boxY, 100, 22, 3, 3, 'F');
  const now = new Date();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.brand);
  doc.text('Data de geração', pageWidth / 2, boxY + 8, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${now.toLocaleDateString('pt-BR')} • ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, boxY + 16, { align: 'center' });
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');
}

export function renderTableOfContents(ctx: PDFContext, documents: { title: string; category: string }[]): void {
  newPage(ctx);
  const { doc, marginLeft, marginRight, pageWidth } = ctx;
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.heading);
  doc.text('Índice', marginLeft, ctx.y);
  ctx.y += 4;
  doc.setDrawColor(...COLORS.brand);
  doc.setLineWidth(0.8);
  doc.line(marginLeft, ctx.y, marginLeft + 25, ctx.y);
  ctx.y += 10;
  let currentCategory = '';
  let docIndex = 0;
  documents.forEach((item) => {
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      checkPageBreak(ctx, 14);
      ctx.y += 4;
      doc.setFillColor(...COLORS.brand);
      doc.rect(marginLeft, ctx.y - 4, 2, 6, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.brand);
      doc.text(currentCategory, marginLeft + 6, ctx.y);
      ctx.y += 7;
    }
    docIndex++;
    checkPageBreak(ctx, 6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.textMuted);
    doc.text(String(docIndex).padStart(2, '0'), marginLeft + 6, ctx.y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const rawTitle = sanitizeForPdf(item.title);
    const titleText = rawTitle.length > 70 ? rawTitle.substring(0, 67) + '...' : rawTitle;
    doc.text(titleText, marginLeft + 16, ctx.y);
    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineDashPattern([0.5, 1.5], 0);
    const titleWidth = doc.getTextWidth(titleText);
    const dotsStart = marginLeft + 17 + titleWidth;
    const dotsEnd = pageWidth - marginRight;
    if (dotsEnd > dotsStart + 5) doc.line(dotsStart, ctx.y - 0.5, dotsEnd, ctx.y - 0.5);
    doc.setLineDashPattern([], 0);
    ctx.y += 5.5;
  });
}
