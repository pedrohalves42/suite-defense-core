/**
 * PDF Content Renderers — Heading, paragraph, code, table, list, blockquote, hr
 */
import { COLORS, strip, sanitizeForPdf, wrapText, checkPageBreak, type PDFContext } from './constants';

export function renderHeading(ctx: PDFContext, level: number, text: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  const config: Record<number, { size: number; spacing: number; underline: boolean; color: readonly [number, number, number] }> = {
    1: { size: 18, spacing: 10, underline: true, color: COLORS.heading },
    2: { size: 15, spacing: 8, underline: true, color: COLORS.heading },
    3: { size: 13, spacing: 6, underline: false, color: COLORS.brand },
    4: { size: 11, spacing: 5, underline: false, color: COLORS.text },
    5: { size: 10, spacing: 4, underline: false, color: COLORS.textLight },
    6: { size: 9, spacing: 4, underline: false, color: COLORS.textLight },
  };
  const cfg = config[level] || config[6];
  checkPageBreak(ctx, cfg.size + cfg.spacing + 5);
  ctx.y += cfg.spacing;
  if (level <= 2) { doc.setFillColor(...COLORS.brand); doc.rect(marginLeft, ctx.y - 5, 3, cfg.size * 0.6, 'F'); }
  doc.setFontSize(cfg.size);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...cfg.color);
  const xOffset = level <= 2 ? 7 : 0;
  const headerLines = wrapText(doc, text, contentWidth - xOffset);
  headerLines.forEach((hl: string) => { checkPageBreak(ctx, cfg.size * 0.5 + 1); doc.text(hl, marginLeft + xOffset, ctx.y); ctx.y += cfg.size * 0.5 + 1; });
  if (cfg.underline) { ctx.y += 1; doc.setDrawColor(...COLORS.tableBorder); doc.setLineWidth(0.3); doc.line(marginLeft, ctx.y, marginLeft + contentWidth, ctx.y); ctx.y += 3; }
  ctx.y += 2;
}

export function renderCodeLine(ctx: PDFContext, line: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  checkPageBreak(ctx, 6);
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  doc.setTextColor(30, 41, 59);
  const codeLines = wrapText(doc, line || ' ', contentWidth - 12);
  codeLines.forEach((cl: string) => {
    checkPageBreak(ctx, 5);
    doc.setFillColor(...COLORS.codeBg); doc.rect(marginLeft, ctx.y - 3.5, contentWidth, 5, 'F');
    doc.setFillColor(...COLORS.codeBorder); doc.rect(marginLeft, ctx.y - 3.5, 1, 5, 'F');
    doc.text(cl, marginLeft + 5, ctx.y);
    ctx.y += 4.5;
  });
}

export function renderBlockquote(ctx: PDFContext, text: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  const cleanText = strip(text);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  const qLines = wrapText(doc, cleanText, contentWidth - 14);
  const blockHeight = qLines.length * 5 + 4;
  checkPageBreak(ctx, blockHeight);
  doc.setFillColor(...COLORS.quoteBg); doc.rect(marginLeft, ctx.y - 3, contentWidth, blockHeight, 'F');
  doc.setFillColor(...COLORS.quoteBorder); doc.rect(marginLeft, ctx.y - 3, 2.5, blockHeight, 'F');
  ctx.y += 1;
  doc.setTextColor(...COLORS.text);
  qLines.forEach((ql: string) => { doc.text(ql, marginLeft + 8, ctx.y); ctx.y += 5; });
  ctx.y += 3;
}

export function renderTable(ctx: PDFContext, rows: string[][]): void {
  if (rows.length === 0) return;
  const { doc, marginLeft, contentWidth } = ctx;
  const colCount = Math.max(...rows.map(r => r.length));
  const colWidth = contentWidth / colCount;
  const rowHeight = 6.5;
  checkPageBreak(ctx, Math.min(rows.length * rowHeight + 2, 40));
  rows.forEach((row, rowIdx) => {
    checkPageBreak(ctx, rowHeight + 1);
    const isHeader = rowIdx === 0;
    const rowY = ctx.y - 4;
    if (isHeader) { doc.setFillColor(...COLORS.tableHeader); doc.rect(marginLeft, rowY, contentWidth, rowHeight, 'F'); }
    else if (rowIdx % 2 === 0) { doc.setFillColor(...COLORS.tableBg); doc.rect(marginLeft, rowY, contentWidth, rowHeight, 'F'); }
    doc.setDrawColor(...COLORS.tableBorder); doc.setLineWidth(0.15); doc.rect(marginLeft, rowY, contentWidth, rowHeight, 'S');
    for (let c = 1; c < colCount; c++) doc.line(marginLeft + c * colWidth, rowY, marginLeft + c * colWidth, rowY + rowHeight);
    doc.setFontSize(8); doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
    doc.setTextColor(isHeader ? 255 : COLORS.text[0], isHeader ? 255 : COLORS.text[1], isHeader ? 255 : COLORS.text[2]);
    row.forEach((cell, colIdx) => {
      const x = marginLeft + colIdx * colWidth + 2;
      const text = strip(cell);
      const maxCellWidth = colWidth - 4;
      const truncated = doc.getTextWidth(text) > maxCellWidth ? text.substring(0, Math.floor(text.length * maxCellWidth / doc.getTextWidth(text))) + '…' : text;
      doc.text(truncated, x, ctx.y);
    });
    ctx.y += rowHeight;
  });
}

export function renderListItem(ctx: PDFContext, match: RegExpMatchArray): void {
  const { doc, marginLeft, contentWidth } = ctx;
  const indent = Math.min(Math.floor(match[1].length / 2) * 5, 20);
  const text = strip(match[3]);
  const isOrdered = /\d+\./.test(match[2]);
  checkPageBreak(ctx, 6);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.text);
  const bulletX = marginLeft + indent;
  if (isOrdered) { doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLORS.brand); doc.text(match[2], bulletX, ctx.y); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.text); }
  else { doc.setFillColor(...COLORS.brand); doc.circle(bulletX + 1.5, ctx.y - 1.2, 0.8, 'F'); }
  const itemLines = wrapText(doc, text, contentWidth - indent - 10);
  itemLines.forEach((il: string, idx: number) => { if (idx > 0) checkPageBreak(ctx, 5); doc.text(il, bulletX + 6, ctx.y); if (idx < itemLines.length - 1) ctx.y += 5; });
  ctx.y += 5.5;
}

export function renderHorizontalRule(ctx: PDFContext): void {
  const { doc, marginLeft, pageWidth, marginRight } = ctx;
  checkPageBreak(ctx, 8);
  ctx.y += 4;
  doc.setDrawColor(...COLORS.hrColor); doc.setLineWidth(0.4);
  const center = pageWidth / 2;
  doc.line(marginLeft, ctx.y, center - 5, ctx.y);
  doc.setFillColor(...COLORS.brand); doc.setDrawColor(...COLORS.brand);
  const d = 1.5;
  doc.line(center - d, ctx.y, center, ctx.y - d); doc.line(center, ctx.y - d, center + d, ctx.y);
  doc.line(center + d, ctx.y, center, ctx.y + d); doc.line(center, ctx.y + d, center - d, ctx.y);
  doc.setDrawColor(...COLORS.hrColor);
  doc.line(center + 5, ctx.y, pageWidth - marginRight, ctx.y);
  ctx.y += 6;
}

export function renderParagraph(ctx: PDFContext, text: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.text);
  const pLines = wrapText(doc, text, contentWidth);
  pLines.forEach((pl: string) => { checkPageBreak(ctx, 5); doc.text(pl, marginLeft, ctx.y); ctx.y += 5; });
  ctx.y += 1;
}

export function renderMarkdownContent(ctx: PDFContext, content: string): void {
  const lines = sanitizeForPdf(content).split('\n');
  let inCodeBlock = false;
  let inTable = false;
  let tableRows: string[][] = [];
  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) { if (inCodeBlock) { inCodeBlock = false; ctx.y += 3; } else { inCodeBlock = true; ctx.y += 2; } continue; }
    if (inCodeBlock) { renderCodeLine(ctx, line); continue; }
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s?/, '');
      if (!inBlockquote) { inBlockquote = true; blockquoteLines = []; }
      blockquoteLines.push(quoteText);
      const nextLine = lines[i + 1];
      if (!nextLine || !nextLine.startsWith('>')) { renderBlockquote(ctx, blockquoteLines.join(' ')); inBlockquote = false; blockquoteLines = []; }
      continue;
    }
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(cells);
      const nextLine = lines[i + 1];
      if (!nextLine || !(nextLine.includes('|') && nextLine.trim().startsWith('|'))) { renderTable(ctx, tableRows); inTable = false; tableRows = []; ctx.y += 4; }
      continue;
    }
    if (line.trim() === '') { ctx.y += 3; continue; }
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) { renderHeading(ctx, headerMatch[1].length, strip(headerMatch[2])); continue; }
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (listMatch) { renderListItem(ctx, listMatch); continue; }
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) { renderHorizontalRule(ctx); continue; }
    renderParagraph(ctx, strip(line));
  }
}
