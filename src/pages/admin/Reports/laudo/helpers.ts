/** Helper to safely format values, replacing nullish/useless values with a fallback */
export function formatValue(value: unknown, fallback = 'Não disponível'): string {
  if (value === null || value === undefined || value === '' || value === 'N' || value === 'N/A') {
    return fallback;
  }
  return String(value);
}

export function getRiskColor(colorName: string): [number, number, number] {
  if (colorName === 'green') return [34, 197, 94];
  if (colorName === 'yellow') return [234, 179, 8];
  if (colorName === 'orange') return [249, 115, 22];
  return [239, 68, 68];
}

export function addPageHeader(doc: import('jspdf').default, laudoId: string, pageWidth: number) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });
}

export function checkPageBreak(doc: import('jspdf').default, yPos: number, pageHeight: number, margin = 80): number {
  if (yPos > pageHeight - margin) {
    doc.addPage();
    return 25;
  }
  return yPos;
}
