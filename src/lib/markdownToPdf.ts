/**
 * Professional PDF generator from Markdown content using jsPDF.
 * Features: branded cover page, colored headers, styled tables, 
 * code blocks, blockquotes, proper footers, and logo integration.
 */

import { loadLogoForPDF, addLogoToPDF } from './pdfLogoHelper';

// ─── Brand Colors (RGB) ───────────────────────────────────────
const COLORS = {
  brand:       [0, 102, 204] as const,     // #0066CC - CyberShield blue
  brandDark:   [0, 71, 153] as const,      // darker blue
  brandLight:  [230, 242, 255] as const,   // light blue bg
  text:        [30, 41, 59] as const,      // slate-800
  textLight:   [100, 116, 139] as const,   // slate-500
  textMuted:   [148, 163, 184] as const,   // slate-400
  heading:     [15, 23, 42] as const,      // slate-900
  codeBg:      [241, 245, 249] as const,   // slate-100
  codeBorder:  [203, 213, 225] as const,   // slate-300
  tableBg:     [248, 250, 252] as const,   // slate-50
  tableHeader: [15, 23, 42] as const,      // slate-900
  tableBorder: [226, 232, 240] as const,   // slate-200
  quoteBorder: [0, 102, 204] as const,
  quoteBg:     [240, 247, 255] as const,
  hrColor:     [226, 232, 240] as const,
  white:       [255, 255, 255] as const,
  success:     [22, 163, 74] as const,
  warning:     [234, 179, 8] as const,
  danger:      [220, 38, 38] as const,
};

interface PDFContext {
  doc: any;
  y: number;
  pageHeight: number;
  pageWidth: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  pageNumber: number;
  title: string;
  logoDataUrl: string | null;
}

function newPage(ctx: PDFContext): void {
  ctx.doc.addPage();
  ctx.pageNumber++;
  ctx.y = ctx.marginTop;
}

function checkPageBreak(ctx: PDFContext, needed: number = 10): void {
  if (ctx.y + needed > ctx.pageHeight - ctx.marginBottom) {
    newPage(ctx);
  }
}

function wrapText(doc: any, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

// Map of Unicode chars unsupported by jsPDF built-in fonts
const CHAR_REPLACEMENTS: Record<string, string> = {
  // Emojis -> ASCII tags
  '\u2705': '[OK] ',      // ✅
  '\u274C': '[X] ',       // ❌
  '\u26A0': '[!] ',       // ⚠
  '\uFE0F': '',           // variation selector (invisible)
  '\u2139': '[i] ',       // ℹ
  '\u{1F534}': '(*) ',    // 🔴
  '\u{1F7E1}': '(*) ',    // 🟡
  '\u{1F7E2}': '(*) ',    // 🟢
  '\u{1F527}': '[JOB] ',  // 🔧
  '\u{1F4ED}': '[POLL] ', // 📭
  '\u{1F4EC}': '[MAIL] ', // 📬
  '\u{1F4E6}': '[PKG] ',  // 📦
  '\u{1F4C4}': '[DOC] ',  // 📄
  '\u{1F50D}': '[SCAN] ', // 🔍
  '\u{1F6E1}': '[SHIELD] ', // 🛡
  '\u{1F6E0}': '[TOOL] ',   // 🛠
  '\u{1F512}': '[LOCK] ',   // 🔒
  '\u{1F513}': '[UNLOCK] ', // 🔓
  '\u{1F4CB}': '[LIST] ',   // 📋
  '\u{1F4CA}': '[CHART] ',  // 📊
  '\u{1F4DD}': '[NOTE] ',   // 📝
  '\u{1F680}': '[LAUNCH] ', // 🚀
  '\u{1F4A1}': '[IDEA] ',   // 💡
  '\u{1F50A}': '[ALERT] ',  // 🔊
  '\u{1F4E2}': '[ANNOUNCE] ', // 📢
  '\u{1F4C5}': '[DATE] ',   // 📅
  '\u{1F464}': '[USER] ',   // 👤
  '\u{1F465}': '[USERS] ',  // 👥
  '\u{1F4BB}': '[PC] ',     // 💻
  '\u{1F310}': '[WEB] ',    // 🌐
  // Arrows and symbols
  '\u2192': '->',    // →
  '\u2190': '<-',    // ←
  '\u2022': '-',     // •
  '\u2013': '-',     // –
  '\u2014': '--',    // —
  '\u201C': '"',     // "
  '\u201D': '"',     // "
  '\u2018': "'",     // '
  '\u2019': "'",     // '
  '\u2026': '...',   // …
  '\u00B2': '2',     // ² (superscript)
};

function sanitizeForPdf(text: string): string {
  let result = text;
  for (const [char, replacement] of Object.entries(CHAR_REPLACEMENTS)) {
    result = result.split(char).join(replacement);
  }
  // Remove any remaining chars outside Latin-1 (> 0xFF) that jsPDF can't render
  result = result.replace(/[^\x00-\xFF]/g, '');
  return result;
}

function strip(text: string): string {
  return sanitizeForPdf(
    text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
  );
}

// ─── Header/Footer Rendering ─────────────────────────────────

function renderHeader(ctx: PDFContext): void {
  const { doc, pageWidth, marginLeft, marginRight } = ctx;
  // Thin brand line at top
  doc.setDrawColor(...COLORS.brand);
  doc.setLineWidth(0.8);
  doc.line(0, 0, pageWidth, 0);
  
  // Small logo + title in header area
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMuted);
  doc.text('CYBERSHIELD', marginLeft, 8);
  
  // Thin separator
  doc.setDrawColor(...COLORS.tableBorder);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, 10, pageWidth - marginRight, 10);
}

function renderFooter(ctx: PDFContext, pageNum: number, totalPages: number): void {
  const { doc, pageWidth, pageHeight, marginLeft, marginRight } = ctx;
  const footerY = pageHeight - 8;
  
  // Separator line
  doc.setDrawColor(...COLORS.tableBorder);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, footerY - 4, pageWidth - marginRight, footerY - 4);
  
  // Left: document title
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.textMuted);
  const footerTitle = ctx.title.length > 50 ? ctx.title.substring(0, 47) + '...' : ctx.title;
  doc.text(footerTitle, marginLeft, footerY);
  
  // Center: "Confidencial"
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.textMuted);
  doc.text('CONFIDENCIAL', pageWidth / 2, footerY, { align: 'center' });
  
  // Right: page number
  doc.setFont('helvetica', 'normal');
  doc.text(`${pageNum} / ${totalPages}`, pageWidth - marginRight, footerY, { align: 'right' });
}

// ─── Cover Page ───────────────────────────────────────────────

function renderCoverPage(ctx: PDFContext, subtitle?: string, docCount?: number): void {
  const { doc, pageWidth, pageHeight } = ctx;
  
  // Full-height brand gradient bar on left
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, 8, pageHeight, 'F');
  
  // Top brand line
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, 0, pageWidth, 3, 'F');
  
  // Logo
  const logoY = 55;
  addLogoToPDF(doc, ctx.logoDataUrl, pageWidth / 2, logoY, 28);
  
  // Title
  let y = logoY + 38;
  doc.setFontSize(34);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.heading);
  doc.text('CyberShield', pageWidth / 2, y, { align: 'center' });
  y += 12;
  
  // Decorative line
  doc.setDrawColor(...COLORS.brand);
  doc.setLineWidth(1);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 12;
  
  // Subtitle
  if (subtitle) {
    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textLight);
    const subLines = wrapText(doc, sanitizeForPdf(subtitle), 140);
    subLines.forEach((sl: string) => {
      doc.text(sl, pageWidth / 2, y, { align: 'center' });
      y += 8;
    });
  }
  
  if (docCount) {
    y += 5;
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(`${docCount} documentos`, pageWidth / 2, y, { align: 'center' });
    y += 8;
  }
  
  // Date box at bottom
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
  doc.text(
    `${now.toLocaleDateString('pt-BR')} • ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    pageWidth / 2, boxY + 16, { align: 'center' }
  );
  
  // Bottom brand bar
  doc.setFillColor(...COLORS.brand);
  doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');
}

// ─── Table of Contents ────────────────────────────────────────

function renderTableOfContents(
  ctx: PDFContext,
  documents: { title: string; category: string }[]
): void {
  newPage(ctx);
  const { doc, marginLeft, marginRight, pageWidth } = ctx;
  
  // TOC title
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
      
      // Category heading with brand accent
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
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    
    // Number
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.textMuted);
    const numStr = String(docIndex).padStart(2, '0');
    doc.text(numStr, marginLeft + 6, ctx.y);
    
    // Title with dot leaders
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const maxTitleWidth = ctx.contentWidth - 20;
    const rawTitle = sanitizeForPdf(item.title);
    const titleText = rawTitle.length > 70 ? rawTitle.substring(0, 67) + '...' : rawTitle;
    
    // Dotted line
    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineDashPattern([0.5, 1.5], 0);
    const titleWidth = doc.getTextWidth(titleText);
    const dotsStart = marginLeft + 17 + titleWidth;
    const dotsEnd = pageWidth - marginRight;
    if (dotsEnd > dotsStart + 5) {
      doc.line(dotsStart, ctx.y - 0.5, dotsEnd, ctx.y - 0.5);
    }
    doc.setLineDashPattern([], 0);
    
    ctx.y += 5.5;
  });
}

// ─── Content Rendering ────────────────────────────────────────

function renderMarkdownContent(ctx: PDFContext, content: string): void {
  const lines = sanitizeForPdf(content).split('\n');
  let inCodeBlock = false;
  let inTable = false;
  let tableRows: string[][] = [];
  let inBlockquote = false;
  let blockquoteLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // ── Code blocks ──
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        ctx.y += 3;
      } else {
        inCodeBlock = true;
        ctx.y += 2;
      }
      continue;
    }
    
    if (inCodeBlock) {
      renderCodeLine(ctx, line);
      continue;
    }
    
    // ── Blockquotes ──
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s?/, '');
      if (!inBlockquote) {
        inBlockquote = true;
        blockquoteLines = [];
      }
      blockquoteLines.push(quoteText);
      
      const nextLine = lines[i + 1];
      if (!nextLine || !nextLine.startsWith('>')) {
        renderBlockquote(ctx, blockquoteLines.join(' '));
        inBlockquote = false;
        blockquoteLines = [];
      }
      continue;
    }
    
    // ── Tables ──
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      
      const nextLine = lines[i + 1];
      if (!nextLine || !(nextLine.includes('|') && nextLine.trim().startsWith('|'))) {
        renderTable(ctx, tableRows);
        inTable = false;
        tableRows = [];
        ctx.y += 4;
      }
      continue;
    }
    
    // ── Empty line ──
    if (line.trim() === '') {
      ctx.y += 3;
      continue;
    }
    
    // ── Headers ──
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      renderHeading(ctx, headerMatch[1].length, strip(headerMatch[2]));
      continue;
    }
    
    // ── List items ──
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (listMatch) {
      renderListItem(ctx, listMatch);
      continue;
    }
    
    // ── Horizontal rule ──
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      renderHorizontalRule(ctx);
      continue;
    }
    
    // ── Regular paragraph ──
    renderParagraph(ctx, strip(line));
  }
}

function renderHeading(ctx: PDFContext, level: number, text: string): void {
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
  
  // Accent bar for H1/H2
  if (level <= 2) {
    doc.setFillColor(...COLORS.brand);
    doc.rect(marginLeft, ctx.y - 5, 3, cfg.size * 0.6, 'F');
  }
  
  doc.setFontSize(cfg.size);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...cfg.color);
  
  const xOffset = level <= 2 ? 7 : 0;
  const headerLines = wrapText(doc, text, contentWidth - xOffset);
  headerLines.forEach((hl: string) => {
    checkPageBreak(ctx, cfg.size * 0.5 + 1);
    doc.text(hl, marginLeft + xOffset, ctx.y);
    ctx.y += cfg.size * 0.5 + 1;
  });
  
  if (cfg.underline) {
    ctx.y += 1;
    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, ctx.y, marginLeft + contentWidth, ctx.y);
    ctx.y += 3;
  }
  ctx.y += 2;
}

function renderCodeLine(ctx: PDFContext, line: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  checkPageBreak(ctx, 6);
  
  doc.setFontSize(8);
  doc.setFont('courier', 'normal');
  doc.setTextColor(30, 41, 59);
  
  const codeLines = wrapText(doc, line || ' ', contentWidth - 12);
  codeLines.forEach((cl: string) => {
    checkPageBreak(ctx, 5);
    // Background
    doc.setFillColor(...COLORS.codeBg);
    doc.rect(marginLeft, ctx.y - 3.5, contentWidth, 5, 'F');
    // Left border accent
    doc.setFillColor(...COLORS.codeBorder);
    doc.rect(marginLeft, ctx.y - 3.5, 1, 5, 'F');
    doc.text(cl, marginLeft + 5, ctx.y);
    ctx.y += 4.5;
  });
}

function renderBlockquote(ctx: PDFContext, text: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  const cleanText = strip(text);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  const qLines = wrapText(doc, cleanText, contentWidth - 14);
  const blockHeight = qLines.length * 5 + 4;
  
  checkPageBreak(ctx, blockHeight);
  
  // Background
  doc.setFillColor(...COLORS.quoteBg);
  doc.rect(marginLeft, ctx.y - 3, contentWidth, blockHeight, 'F');
  // Left border
  doc.setFillColor(...COLORS.quoteBorder);
  doc.rect(marginLeft, ctx.y - 3, 2.5, blockHeight, 'F');
  
  ctx.y += 1;
  doc.setTextColor(...COLORS.text);
  qLines.forEach((ql: string) => {
    doc.text(ql, marginLeft + 8, ctx.y);
    ctx.y += 5;
  });
  ctx.y += 3;
}

function renderTable(ctx: PDFContext, rows: string[][]): void {
  if (rows.length === 0) return;
  const { doc, marginLeft, contentWidth } = ctx;
  
  const colCount = Math.max(...rows.map(r => r.length));
  const colWidth = contentWidth / colCount;
  const rowHeight = 6.5;
  
  // Calculate total table height for page break check
  const totalHeight = rows.length * rowHeight + 2;
  checkPageBreak(ctx, Math.min(totalHeight, 40));
  
  rows.forEach((row, rowIdx) => {
    checkPageBreak(ctx, rowHeight + 1);
    const isHeader = rowIdx === 0;
    const rowY = ctx.y - 4;
    
    if (isHeader) {
      // Dark header
      doc.setFillColor(...COLORS.tableHeader);
      doc.rect(marginLeft, rowY, contentWidth, rowHeight, 'F');
    } else if (rowIdx % 2 === 0) {
      // Zebra striping
      doc.setFillColor(...COLORS.tableBg);
      doc.rect(marginLeft, rowY, contentWidth, rowHeight, 'F');
    }
    
    // Cell borders
    doc.setDrawColor(...COLORS.tableBorder);
    doc.setLineWidth(0.15);
    doc.rect(marginLeft, rowY, contentWidth, rowHeight, 'S');
    
    // Vertical lines
    for (let c = 1; c < colCount; c++) {
      doc.line(marginLeft + c * colWidth, rowY, marginLeft + c * colWidth, rowY + rowHeight);
    }
    
    // Cell text
    doc.setFontSize(8);
    doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
    doc.setTextColor(isHeader ? 255 : COLORS.text[0], isHeader ? 255 : COLORS.text[1], isHeader ? 255 : COLORS.text[2]);
    
    row.forEach((cell, colIdx) => {
      const x = marginLeft + colIdx * colWidth + 2;
      const text = strip(cell);
      const maxCellWidth = colWidth - 4;
      const truncated = doc.getTextWidth(text) > maxCellWidth
        ? text.substring(0, Math.floor(text.length * maxCellWidth / doc.getTextWidth(text))) + '…'
        : text;
      doc.text(truncated, x, ctx.y);
    });
    ctx.y += rowHeight;
  });
}

function renderListItem(ctx: PDFContext, match: RegExpMatchArray): void {
  const { doc, marginLeft, contentWidth } = ctx;
  const indent = Math.min(Math.floor(match[1].length / 2) * 5, 20);
  const text = strip(match[3]);
  const isOrdered = /\d+\./.test(match[2]);
  
  checkPageBreak(ctx, 6);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  
  const bulletX = marginLeft + indent;
  
  if (isOrdered) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.brand);
    doc.text(match[2], bulletX, ctx.y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
  } else {
    // Filled circle bullet
    doc.setFillColor(...COLORS.brand);
    doc.circle(bulletX + 1.5, ctx.y - 1.2, 0.8, 'F');
  }
  
  const itemLines = wrapText(doc, text, contentWidth - indent - 10);
  itemLines.forEach((il: string, idx: number) => {
    if (idx > 0) checkPageBreak(ctx, 5);
    doc.text(il, bulletX + 6, ctx.y);
    if (idx < itemLines.length - 1) ctx.y += 5;
  });
  ctx.y += 5.5;
}

function renderHorizontalRule(ctx: PDFContext): void {
  const { doc, marginLeft, pageWidth, marginRight } = ctx;
  checkPageBreak(ctx, 8);
  ctx.y += 4;
  doc.setDrawColor(...COLORS.hrColor);
  doc.setLineWidth(0.4);
  const center = pageWidth / 2;
  doc.line(marginLeft, ctx.y, center - 5, ctx.y);
  // Diamond ornament
  doc.setFillColor(...COLORS.brand);
  doc.setDrawColor(...COLORS.brand);
  // Small diamond shape via lines
  const d = 1.5;
  doc.line(center - d, ctx.y, center, ctx.y - d);
  doc.line(center, ctx.y - d, center + d, ctx.y);
  doc.line(center + d, ctx.y, center, ctx.y + d);
  doc.line(center, ctx.y + d, center - d, ctx.y);
  
  doc.setDrawColor(...COLORS.hrColor);
  doc.line(center + 5, ctx.y, pageWidth - marginRight, ctx.y);
  ctx.y += 6;
}

function renderParagraph(ctx: PDFContext, text: string): void {
  const { doc, marginLeft, contentWidth } = ctx;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  
  const pLines = wrapText(doc, text, contentWidth);
  pLines.forEach((pl: string) => {
    checkPageBreak(ctx, 5);
    doc.text(pl, marginLeft, ctx.y);
    ctx.y += 5;
  });
  ctx.y += 1;
}

// ─── Public API ───────────────────────────────────────────────

export async function generatePDFFromMarkdown(
  title: string,
  markdownContent: string
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const logoDataUrl = await loadLogoForPDF();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 18;
  const marginRight = 18;
  const marginTop = 16;
  const marginBottom = 16;

  const ctx: PDFContext = {
    doc,
    y: marginTop,
    pageHeight,
    pageWidth,
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    contentWidth: pageWidth - marginLeft - marginRight,
    pageNumber: 1,
    title,
    logoDataUrl,
  };

  // Cover page
  renderCoverPage(ctx, title);
  
  // Content starts on next page
  newPage(ctx);
  ctx.y = marginTop + 4;
  
  renderMarkdownContent(ctx, markdownContent);

  // Apply headers & footers to all pages (skip cover)
  const totalPages = (doc as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p === 1) continue; // skip cover
    renderHeader(ctx);
    renderFooter(ctx, p - 1, totalPages - 1);
  }

  return doc.output('blob');
}

export async function generateConsolidatedPDF(
  documents: { title: string; category: string; content: string }[]
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const logoDataUrl = await loadLogoForPDF();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 18;
  const marginRight = 18;
  const marginTop = 16;
  const marginBottom = 16;

  const ctx: PDFContext = {
    doc,
    y: marginTop,
    pageHeight,
    pageWidth,
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    contentWidth: pageWidth - marginLeft - marginRight,
    pageNumber: 1,
    title: 'Documentação Completa',
    logoDataUrl,
  };

  // Cover
  renderCoverPage(ctx, 'Documentação Completa de Governança, Segurança e Operações', documents.length);

  // Table of Contents
  renderTableOfContents(ctx, documents);

  // Each document
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
    doc.roundedRect(marginLeft, ctx.y - 4, catWidth, 6, 1.5, 1.5, 'FD');
    doc.setTextColor(...COLORS.brand);
    doc.text(catText, marginLeft + 3, ctx.y);
    ctx.y += 8;
    
    // Document title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.heading);
    const titleLines = wrapText(doc, docItem.title, ctx.contentWidth);
    titleLines.forEach((tl: string) => {
      doc.text(tl, marginLeft, ctx.y);
      ctx.y += 8;
    });
    
    // Accent line
    doc.setDrawColor(...COLORS.brand);
    doc.setLineWidth(0.8);
    doc.line(marginLeft, ctx.y, marginLeft + 40, ctx.y);
    ctx.y += 8;
    
    // Content
    renderMarkdownContent(ctx, docItem.content);
  }

  // Apply headers & footers (skip cover page = page 1)
  const totalPages = (doc as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (p === 1) continue;
    renderHeader(ctx);
    renderFooter(ctx, p - 1, totalPages - 1);
  }

  return doc.output('blob');
}
