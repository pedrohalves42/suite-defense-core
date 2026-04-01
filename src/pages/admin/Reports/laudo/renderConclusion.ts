import type { LaudoContext } from './types';
import { formatValue, checkPageBreak } from './helpers';

export function renderConclusion(ctx: LaudoContext) {
  const { doc, pageWidth, pageHeight, laudoId, dateStrFull, validUntilStr, riskScore, riskClass, reportData, stats, qrCodeDataUrl } = ctx;

  let yPos = checkPageBreak(doc, 999, pageHeight, 100); // force check

  yPos += 10;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('5. CONCLUSÃO', 14, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const conclusionLines = [
    `Este laudo analisou ${formatValue(stats.total_agents, '0')} computador(es) protegido(s) pelo CyberShield.`,
    '',
    `O ambiente apresenta nível de risco ${formatValue(riskClass.level, 'Pendente')} com score ${riskScore}/100.`,
    '',
    reportData.recommendations && reportData.recommendations.length > 0
      ? `Foram identificadas ${reportData.recommendations.length} recomendação(ões) prioritária(s) que devem ser`
      : 'Não foram identificadas recomendações críticas neste momento.',
    reportData.recommendations && reportData.recommendations.length > 0
      ? 'tratadas para melhorar a postura de segurança do ambiente.'
      : '',
    '',
    'Este laudo é válido por 30 dias a partir da data de emissão.',
    'Recomenda-se a execução de novo laudo após este período para acompanhamento.',
  ];

  conclusionLines.forEach(line => {
    if (line) { doc.text(line, 14, yPos); yPos += 5; }
  });

  // Certification Seal
  yPos += 15;

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, yPos, pageWidth - 28, 55, 5, 5, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, yPos, pageWidth - 28, 55, 5, 5, 'S');

  doc.setFillColor(37, 99, 235);
  doc.circle(35, yPos + 27, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('✓', 35, 31 + yPos, { align: 'center' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICADO DE SEGURANÇA', 55, yPos + 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Laudo Nº: ${laudoId}`, 55, yPos + 25);
  doc.text(`Emitido em: ${dateStrFull}`, 55, yPos + 33);
  doc.text(`Válido até: ${validUntilStr}`, 55, yPos + 41);

  try {
    doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - 55, yPos + 5, 35, 35);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text('Verifique online', pageWidth - 37.5, yPos + 45, { align: 'center' });
  } catch {
    // QR code generation failed — non-critical
  }
}
