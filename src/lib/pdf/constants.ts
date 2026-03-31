/**
 * PDF Constants — Brand colors, character replacements, types
 */

export const COLORS = {
  brand:       [0, 102, 204] as const,
  brandDark:   [0, 71, 153] as const,
  brandLight:  [230, 242, 255] as const,
  text:        [30, 41, 59] as const,
  textLight:   [100, 116, 139] as const,
  textMuted:   [148, 163, 184] as const,
  heading:     [15, 23, 42] as const,
  codeBg:      [241, 245, 249] as const,
  codeBorder:  [203, 213, 225] as const,
  tableBg:     [248, 250, 252] as const,
  tableHeader: [15, 23, 42] as const,
  tableBorder: [226, 232, 240] as const,
  quoteBorder: [0, 102, 204] as const,
  quoteBg:     [240, 247, 255] as const,
  hrColor:     [226, 232, 240] as const,
  white:       [255, 255, 255] as const,
  success:     [22, 163, 74] as const,
  warning:     [234, 179, 8] as const,
  danger:      [220, 38, 38] as const,
};

export interface PDFContext {
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

export const CHAR_REPLACEMENTS: Record<string, string> = {
  '\u2705': '[OK] ', '\u274C': '[X] ', '\u26A0': '[!] ', '\uFE0F': '',
  '\u2139': '[i] ', '\u{1F534}': '(*) ', '\u{1F7E1}': '(*) ', '\u{1F7E2}': '(*) ',
  '\u{1F527}': '[JOB] ', '\u{1F4ED}': '[POLL] ', '\u{1F4EC}': '[MAIL] ',
  '\u{1F4E6}': '[PKG] ', '\u{1F4C4}': '[DOC] ', '\u{1F50D}': '[SCAN] ',
  '\u{1F6E1}': '[SHIELD] ', '\u{1F6E0}': '[TOOL] ', '\u{1F512}': '[LOCK] ',
  '\u{1F513}': '[UNLOCK] ', '\u{1F4CB}': '[LIST] ', '\u{1F4CA}': '[CHART] ',
  '\u{1F4DD}': '[NOTE] ', '\u{1F680}': '[LAUNCH] ', '\u{1F4A1}': '[IDEA] ',
  '\u{1F50A}': '[ALERT] ', '\u{1F4E2}': '[ANNOUNCE] ', '\u{1F4C5}': '[DATE] ',
  '\u{1F464}': '[USER] ', '\u{1F465}': '[USERS] ', '\u{1F4BB}': '[PC] ',
  '\u{1F310}': '[WEB] ',
  '\u2192': '->', '\u2190': '<-', '\u2022': '-', '\u2013': '-', '\u2014': '--',
  '\u201C': '"', '\u201D': '"', '\u2018': "'", '\u2019': "'",
  '\u2026': '...', '\u00B2': '2',
};

export function sanitizeForPdf(text: string): string {
  let result = text;
  for (const [char, replacement] of Object.entries(CHAR_REPLACEMENTS)) {
    result = result.split(char).join(replacement);
  }
  return result.replace(/[^\x00-\xFF]/g, '');
}

export function strip(text: string): string {
  return sanitizeForPdf(
    text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1').replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/~~(.*?)~~/g, '$1')
  );
}

export function newPage(ctx: PDFContext): void {
  ctx.doc.addPage();
  ctx.pageNumber++;
  ctx.y = ctx.marginTop;
}

export function checkPageBreak(ctx: PDFContext, needed: number = 10): void {
  if (ctx.y + needed > ctx.pageHeight - ctx.marginBottom) newPage(ctx);
}

export function wrapText(doc: any, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}
