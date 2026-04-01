import type { LaudoContext } from './types';
import { formatValue, addPageHeader } from './helpers';

export function renderRecommendations(ctx: LaudoContext): number {
  const { doc, pageWidth, pageHeight, laudoId, reportData } = ctx;

  doc.addPage();
  let yPos = 25;

  addPageHeader(doc, laudoId, pageWidth);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('4. RECOMENDAÇÕES PRIORIZADAS', 14, yPos);
  yPos += 12;

  if (reportData.recommendations && reportData.recommendations.length > 0) {
    reportData.recommendations.forEach((rec) => {
      if (yPos > pageHeight - 40) { doc.addPage(); yPos = 25; }

      const priorityColors: Record<number, [number, number, number]> = {
        1: [220, 38, 38], 2: [249, 115, 22], 3: [234, 179, 8], 4: [59, 130, 246],
        5: [107, 114, 128], 6: [107, 114, 128], 7: [107, 114, 128],
      };
      const color = priorityColors[rec.priority] || [107, 114, 128];

      doc.setFillColor(color[0], color[1], color[2]);
      doc.circle(20, yPos + 2, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(String(rec.priority), 20, yPos + 4, { align: 'center' });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`[${formatValue(rec.category, 'Geral')}] ${formatValue(rec.title, 'Recomendação')}`, 28, yPos + 2);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(formatValue(rec.description, 'Sem descrição detalhada'), 28, yPos + 10);
      yPos += 20;
    });
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 197, 94);
    doc.text('✓ Nenhuma recomendação prioritária no momento', 14, yPos);
    yPos += 12;
  }

  return yPos;
}
