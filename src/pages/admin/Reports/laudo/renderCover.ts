import { addLogoToPDF } from '@/lib/pdfLogoHelper';
import type { LaudoContext } from './types';
import { formatValue } from './helpers';

export function renderCover(ctx: LaudoContext) {
  const { doc, pageWidth, pageHeight, riskScore, riskClass, riskColor, laudoId, dateStrFull, validUntilStr, reportData, agents, logoDataUrl } = ctx;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 30, 36);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('LAUDO DE SEGURANÇA', pageWidth / 2, 100, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Análise Completa de Vulnerabilidades e Riscos', pageWidth / 2, 112, { align: 'center' });

  // Risk Score Circle
  doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
  doc.circle(pageWidth / 2, 155, 32, 'F');
  doc.setFillColor(15, 23, 42);
  doc.circle(pageWidth / 2, 155, 26, 'F');
  doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(String(riskScore), pageWidth / 2, 160, { align: 'center' });
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text('SCORE', pageWidth / 2, 170, { align: 'center' });

  // Risk level badge
  doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
  doc.roundedRect(pageWidth / 2 - 35, 185, 70, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`RISCO: ${formatValue(riskClass.level, 'PENDENTE')}`, pageWidth / 2, 193, { align: 'center' });

  // Metadata box
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(30, 210, pageWidth - 60, 50, 5, 5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const filterText = reportData.agent_filter === 'all'
    ? 'Todos os Computadores'
    : `Computador: ${agents?.find(a => a.id === reportData.agent_filter)?.agent_name || reportData.agent_filter}`;

  doc.text(`Laudo Nº: ${laudoId}`, 40, 225);
  doc.text(`Data de Emissão: ${dateStrFull}`, 40, 235);
  doc.text(`Válido até: ${validUntilStr}`, 40, 245);
  doc.text(`Escopo: ${filterText}`, 40, 255);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('CyberShield Security Platform', pageWidth / 2, pageHeight - 25, { align: 'center' });
  doc.text('www.cybershield.com.br', pageWidth / 2, pageHeight - 17, { align: 'center' });
}
