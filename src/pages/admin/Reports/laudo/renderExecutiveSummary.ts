import autoTable from 'jspdf-autotable';
import type { LaudoContext } from './types';
import { formatValue, addPageHeader } from './helpers';

export function renderExecutiveSummary(ctx: LaudoContext) {
  const { doc, pageWidth, pageHeight, riskScore, riskClass, riskColor, laudoId, stats, unprotected } = ctx;

  doc.addPage();
  let yPos = 20;

  addPageHeader(doc, laudoId, pageWidth);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('1. SUMÁRIO EXECUTIVO', 14, yPos + 10);
  yPos += 20;

  // Risk classification box
  const bgColors: Record<string, [number, number, number]> = {
    green: [220, 252, 231], yellow: [254, 249, 195], orange: [255, 237, 213], red: [254, 226, 226], gray: [241, 245, 249],
  };
  const textColors: Record<string, [number, number, number]> = {
    green: [22, 101, 52], yellow: [113, 63, 18], orange: [154, 52, 18], red: [153, 27, 27], gray: [71, 85, 105],
  };

  const bgColor = bgColors[riskClass.color] || bgColors.gray;
  const txtColor = textColors[riskClass.color] || textColors.gray;

  doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
  doc.roundedRect(14, yPos, pageWidth - 28, 30, 3, 3, 'F');
  doc.setTextColor(txtColor[0], txtColor[1], txtColor[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Classificação: ${formatValue(riskClass.level, 'Pendente')} (Score: ${riskScore}/100)`, 20, yPos + 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatValue(riskClass.description, 'Análise de risco em andamento'), 20, yPos + 22);
  yPos += 40;

  // Visual Risk Bar
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Indicador Visual de Risco:', 14, yPos);
  yPos += 6;

  doc.setFillColor(229, 231, 235);
  doc.roundedRect(14, yPos, pageWidth - 28, 8, 2, 2, 'F');
  const barWidth = ((100 - riskScore) / 100) * (pageWidth - 28);
  doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
  doc.roundedRect(14, yPos, Math.max(barWidth, 5), 8, 2, 2, 'F');

  yPos += 12;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('0 (Crítico)', 14, yPos);
  doc.text('100 (Seguro)', pageWidth - 14, yPos, { align: 'right' });
  yPos += 12;

  // Key metrics
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Principais Indicadores:', 14, yPos);
  yPos += 6;

  const keyMetrics = [
    ['Computadores Monitorados', formatValue(stats.total_agents, '0')],
    ['Computadores Desprotegidos', formatValue(unprotected.no_antivirus, '0')],
    ['Antivírus Desatualizado', formatValue(unprotected.outdated_av, '0')],
    ['Computadores Offline', formatValue(unprotected.offline_agents, '0')],
    ['Vulnerabilidades Críticas', formatValue(stats.critical_vulnerabilities, '0')],
    ['Vulnerabilidades Altas', formatValue(stats.high_vulnerabilities, '0')],
    ['Ameaças Detectadas', formatValue(stats.threats_found, '0')],
    ['Tentativas Login Suspeitas (24h)', formatValue(stats.failed_login_attempts_24h, '0')],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Indicador', 'Valor']],
    body: keyMetrics,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'center', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  yPos = doc.lastAutoTable.finalY + 15;

  // Vulnerability distribution
  yPos = renderVulnDistribution(doc, yPos, pageWidth, pageHeight, stats);

  // "O QUE ISSO SIGNIFICA" section
  yPos = renderExplanation(doc, yPos, pageWidth, pageHeight, riskScore, stats, unprotected);

  return yPos;
}

function renderVulnDistribution(
  doc: import('jspdf').default,
  yPos: number,
  pageWidth: number,
  pageHeight: number,
  stats: LaudoContext['stats'],
): number {
  if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Distribuição de Vulnerabilidades por Severidade:', 14, yPos);
  yPos += 10;

  const vulnCritical = stats.critical_vulnerabilities || 0;
  const vulnHigh = stats.high_vulnerabilities || 0;
  const vulnMedium = stats.medium_vulnerabilities || 0;
  const vulnLow = stats.low_vulnerabilities || 0;
  const vulnTotal = vulnCritical + vulnHigh + vulnMedium + vulnLow;

  if (vulnTotal > 0) {
    const legendItems = [
      { label: `Críticas: ${vulnCritical}`, color: [220, 38, 38] as [number, number, number], pct: Math.round((vulnCritical / vulnTotal) * 100) },
      { label: `Altas: ${vulnHigh}`, color: [249, 115, 22] as [number, number, number], pct: Math.round((vulnHigh / vulnTotal) * 100) },
      { label: `Médias: ${vulnMedium}`, color: [234, 179, 8] as [number, number, number], pct: Math.round((vulnMedium / vulnTotal) * 100) },
      { label: `Baixas: ${vulnLow}`, color: [34, 197, 94] as [number, number, number], pct: Math.round((vulnLow / vulnTotal) * 100) },
    ];

    legendItems.forEach((item, idx) => {
      const barY = yPos + (idx * 12);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(item.label, 14, barY + 6);
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(55, barY, 100, 8, 2, 2, 'F');
      const filledWidth = (item.pct / 100) * 100;
      doc.setFillColor(item.color[0], item.color[1], item.color[2]);
      doc.roundedRect(55, barY, Math.max(filledWidth, 2), 8, 2, 2, 'F');
      doc.setTextColor(100, 100, 100);
      doc.text(`${item.pct}%`, 160, barY + 6);
    });
    yPos += 55;
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 197, 94);
    doc.text('✓ Nenhuma vulnerabilidade detectada', 14, yPos);
    yPos += 15;
  }

  return yPos;
}

function renderExplanation(
  doc: import('jspdf').default,
  yPos: number,
  pageWidth: number,
  pageHeight: number,
  riskScore: number,
  stats: LaudoContext['stats'],
  unprotected: LaudoContext['unprotected'],
): number {
  if (yPos > pageHeight - 100) { doc.addPage(); yPos = 25; }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text('📋 O QUE ISSO SIGNIFICA PARA VOCÊ?', 14, yPos);
  yPos += 10;

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(14, yPos, pageWidth - 28, 70, 4, 4, 'F');
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, yPos, pageWidth - 28, 70, 4, 4, 'S');

  doc.setTextColor(30, 64, 175);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Em linguagem simples:', 20, yPos + 10);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);

  let explanation = '';
  if (riskScore >= 80) explanation = 'Seus computadores estão bem protegidos! Continue mantendo os programas atualizados e o antivírus ativo.';
  else if (riskScore >= 60) explanation = 'Sua proteção está boa, mas há alguns pontos de atenção. Recomendamos verificar as atualizações pendentes.';
  else if (riskScore >= 40) explanation = 'Há riscos moderados que precisam de atenção. Algumas falhas de segurança foram encontradas e devem ser corrigidas.';
  else explanation = 'ATENÇÃO: Foram encontrados riscos significativos. Recomendamos ação imediata para proteger seus dados e sistemas.';

  const explanationLines = doc.splitTextToSize(explanation, pageWidth - 48);
  explanationLines.forEach((line: string, i: number) => {
    doc.text(line, 20, yPos + 20 + (i * 5));
  });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('Principais pontos:', 20, yPos + 38);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);

  const bulletPoints: string[] = [];
  if (stats.critical_vulnerabilities > 0) bulletPoints.push(`• ${stats.critical_vulnerabilities} problema(s) crítico(s) que podem permitir invasões`);
  if (stats.threats_found > 0) bulletPoints.push(`• ${stats.threats_found} ameaça(s) de vírus detectada(s)`);
  if (unprotected.no_antivirus > 0) bulletPoints.push(`• ${unprotected.no_antivirus} computador(es) sem proteção antivírus`);
  if (unprotected.offline_agents > 0) bulletPoints.push(`• ${unprotected.offline_agents} computador(es) offline (não monitorados)`);
  if (bulletPoints.length === 0) bulletPoints.push('• Nenhum problema crítico detectado no momento');

  bulletPoints.slice(0, 3).forEach((point, i) => {
    doc.text(point.substring(0, 80), 20, yPos + 46 + (i * 5));
  });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175);
  doc.text('O que fazer agora:', 20, yPos + 62);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);

  const actionText = riskScore >= 60
    ? 'Continue monitorando. Agende uma revisão mensal.'
    : 'Entre em contato conosco para resolver os problemas identificados.';
  doc.text(actionText, 20, yPos + 68);
  yPos += 80;

  return yPos;
}
