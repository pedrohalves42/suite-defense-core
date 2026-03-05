/**
 * Converts markdown content to a formatted PDF using jsPDF.
 * Handles headers, paragraphs, lists, code blocks, tables, and bold/italic text.
 */

interface PDFContext {
  doc: any;
  y: number;
  pageHeight: number;
  pageWidth: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  lineHeight: number;
}

function checkPageBreak(ctx: PDFContext, neededSpace: number = 10): PDFContext {
  if (ctx.y + neededSpace > ctx.pageHeight - ctx.marginBottom) {
    ctx.doc.addPage();
    ctx.y = ctx.marginTop;
  }
  return ctx;
}

function wrapText(doc: any, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/~~(.*?)~~/g, '$1');
}

export async function generatePDFFromMarkdown(
  title: string,
  markdownContent: string
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const marginTop = 20;
  const marginBottom = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;

  const ctx: PDFContext = {
    doc,
    y: marginTop,
    pageHeight,
    pageWidth,
    marginLeft,
    marginRight,
    marginTop,
    marginBottom,
    lineHeight: 6,
  };

  // Title page
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  const titleLines = wrapText(doc, title, contentWidth);
  titleLines.forEach((line: string) => {
    checkPageBreak(ctx, 12);
    doc.text(line, marginLeft, ctx.y);
    ctx.y += 10;
  });

  ctx.y += 5;
  doc.setDrawColor(59, 130, 246); // blue-500
  doc.setLineWidth(0.5);
  doc.line(marginLeft, ctx.y, pageWidth - marginRight, ctx.y);
  ctx.y += 10;

  // Footer with page number and date
  const addFooter = (pageNum: number) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`CyberShield • ${title}`, marginLeft, pageHeight - 10);
    doc.text(`Página ${pageNum}`, pageWidth - marginRight, pageHeight - 10, { align: 'right' });
  };

  // Parse and render markdown
  const lines = markdownContent.split('\n');
  let inCodeBlock = false;
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        ctx.y += 3;
        continue;
      }
      inCodeBlock = true;
      ctx.y += 2;
      continue;
    }

    if (inCodeBlock) {
      checkPageBreak(ctx, 6);
      doc.setFontSize(8);
      doc.setFont('courier', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.setFillColor(241, 245, 249); // slate-100
      const codeLines = wrapText(doc, line || ' ', contentWidth - 10);
      codeLines.forEach((cl: string) => {
        checkPageBreak(ctx, 5);
        doc.rect(marginLeft, ctx.y - 3.5, contentWidth, 5, 'F');
        doc.text(cl, marginLeft + 3, ctx.y);
        ctx.y += 4.5;
      });
      continue;
    }

    // Table detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      // Skip separator rows
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      
      // Check if next line is not a table
      const nextLine = lines[i + 1];
      if (!nextLine || !(nextLine.includes('|') && nextLine.trim().startsWith('|'))) {
        // Render table
        renderSimpleTable(ctx, tableRows, contentWidth);
        inTable = false;
        tableRows = [];
        ctx.y += 3;
      }
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      ctx.y += 3;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = stripMarkdownFormatting(headerMatch[2]);
      const sizes = [18, 15, 13, 11, 10, 9];
      const fontSize = sizes[level - 1] || 9;

      checkPageBreak(ctx, fontSize + 5);
      ctx.y += level <= 2 ? 8 : 4;
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);

      const headerLines = wrapText(doc, text, contentWidth);
      headerLines.forEach((hl: string) => {
        checkPageBreak(ctx, fontSize * 0.5);
        doc.text(hl, marginLeft, ctx.y);
        ctx.y += fontSize * 0.5 + 1;
      });

      if (level <= 2) {
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(marginLeft, ctx.y, pageWidth - marginRight, ctx.y);
        ctx.y += 3;
      }
      ctx.y += 2;
      continue;
    }

    // List items
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (listMatch) {
      const indent = Math.min(Math.floor(listMatch[1].length / 2) * 5, 20);
      const text = stripMarkdownFormatting(listMatch[3]);
      const isOrdered = /\d+\./.test(listMatch[2]);

      checkPageBreak(ctx, 6);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);

      const bullet = isOrdered ? listMatch[2] : '•';
      const bulletX = marginLeft + indent;
      doc.text(bullet, bulletX, ctx.y);

      const itemLines = wrapText(doc, text, contentWidth - indent - 8);
      itemLines.forEach((il: string, idx: number) => {
        if (idx > 0) checkPageBreak(ctx, 5);
        doc.text(il, bulletX + 6, ctx.y);
        if (idx < itemLines.length - 1) ctx.y += 5;
      });
      ctx.y += 5;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      checkPageBreak(ctx, 5);
      ctx.y += 3;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, ctx.y, pageWidth - marginRight, ctx.y);
      ctx.y += 5;
      continue;
    }

    // Regular paragraph
    const text = stripMarkdownFormatting(line);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    const pLines = wrapText(doc, text, contentWidth);
    pLines.forEach((pl: string) => {
      checkPageBreak(ctx, 5);
      doc.text(pl, marginLeft, ctx.y);
      ctx.y += 5;
    });
    ctx.y += 1;
  }

  // Add footers to all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    addFooter(p);
  }

  return doc.output('blob');
}

function renderSimpleTable(ctx: PDFContext, rows: string[][], contentWidth: number) {
  if (rows.length === 0) return;

  const colCount = Math.max(...rows.map(r => r.length));
  const colWidth = contentWidth / colCount;

  rows.forEach((row, rowIdx) => {
    checkPageBreak(ctx, 7);
    const isHeader = rowIdx === 0;

    if (isHeader) {
      ctx.doc.setFillColor(241, 245, 249);
      ctx.doc.rect(ctx.marginLeft, ctx.y - 4, contentWidth, 6, 'F');
    }

    ctx.doc.setFontSize(8);
    ctx.doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
    ctx.doc.setTextColor(30, 41, 59);

    row.forEach((cell, colIdx) => {
      const x = ctx.marginLeft + colIdx * colWidth + 2;
      const text = stripMarkdownFormatting(cell);
      const truncated = text.length > 40 ? text.substring(0, 37) + '...' : text;
      ctx.doc.text(truncated, x, ctx.y);
    });
    ctx.y += 5;
  });
}

/**
 * Generate a single consolidated PDF from multiple documents
 */
export async function generateConsolidatedPDF(
  documents: { title: string; category: string; content: string }[]
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const marginTop = 20;
  const marginBottom = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = marginTop;

  // Cover page
  y = 80;
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CyberShield', pageWidth / 2, y, { align: 'center' });
  y += 15;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Documentação Completa', pageWidth / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(11);
  doc.text(`${documents.length} documentos`, pageWidth / 2, y, { align: 'center' });
  y += 8;

  const now = new Date();
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`,
    pageWidth / 2, y, { align: 'center' }
  );

  // Table of contents
  doc.addPage();
  y = marginTop;
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Índice', marginLeft, y);
  y += 12;

  let currentCategory = '';
  documents.forEach((docItem, idx) => {
    if (docItem.category !== currentCategory) {
      currentCategory = docItem.category;
      if (y + 12 > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }
      y += 4;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(59, 130, 246);
      doc.text(currentCategory, marginLeft, y);
      y += 6;
    }

    if (y + 6 > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const tocText = `${idx + 1}. ${docItem.title}`;
    doc.text(tocText.length > 80 ? tocText.substring(0, 77) + '...' : tocText, marginLeft + 5, y);
    y += 5;
  });

  // Each document
  for (const docItem of documents) {
    doc.addPage();
    // Use the single-doc renderer for content
    const singleBlob = await generatePDFFromMarkdown(docItem.title, docItem.content);
    // We can't merge blobs, so render inline instead
    y = marginTop;

    // Category badge
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(59, 130, 246);
    doc.text(docItem.category.toUpperCase(), marginLeft, y);
    y += 8;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const titleLines = doc.splitTextToSize(docItem.title, contentWidth);
    titleLines.forEach((tl: string) => {
      doc.text(tl, marginLeft, y);
      y += 8;
    });

    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 8;

    // Content - simplified rendering
    const lines = docItem.content.split('\n');
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        y += 2;
        continue;
      }

      if (y + 6 > pageHeight - marginBottom) {
        doc.addPage();
        y = marginTop;
      }

      if (line.trim() === '') {
        y += 3;
        continue;
      }

      const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = stripMarkdownFormatting(headerMatch[2]);
        const sizes = [15, 13, 11, 10, 9, 9];
        doc.setFontSize(sizes[level - 1]);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        y += level <= 2 ? 5 : 3;
        const hLines = doc.splitTextToSize(text, contentWidth);
        hLines.forEach((hl: string) => {
          if (y + 6 > pageHeight - marginBottom) { doc.addPage(); y = marginTop; }
          doc.text(hl, marginLeft, y);
          y += 6;
        });
        y += 2;
        continue;
      }

      const text = stripMarkdownFormatting(line);
      if (inCodeBlock) {
        doc.setFontSize(8);
        doc.setFont('courier', 'normal');
        doc.setTextColor(30, 41, 59);
        doc.setFillColor(241, 245, 249);
        const cLines = doc.splitTextToSize(text || ' ', contentWidth - 6);
        cLines.forEach((cl: string) => {
          if (y + 5 > pageHeight - marginBottom) { doc.addPage(); y = marginTop; }
          doc.rect(marginLeft, y - 3.5, contentWidth, 5, 'F');
          doc.text(cl, marginLeft + 3, y);
          y += 4.5;
        });
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const pLines = doc.splitTextToSize(text, contentWidth);
        pLines.forEach((pl: string) => {
          if (y + 5 > pageHeight - marginBottom) { doc.addPage(); y = marginTop; }
          doc.text(pl, marginLeft, y);
          y += 5;
        });
      }
    }
  }

  // Add page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('CyberShield - Documentação', marginLeft, pageHeight - 10);
    doc.text(`${p} / ${totalPages}`, pageWidth - marginRight, pageHeight - 10, { align: 'right' });
  }

  return doc.output('blob');
}
