import { formatBrazilDateTime } from '@/lib/date-utils';
import type { SecurityReport, Agent } from './types';

/** Helper to safely format values, replacing nullish/useless values with a fallback */
function formatValue(value: unknown, fallback = 'Não disponível'): string {
  if (value === null || value === undefined || value === '' || value === 'N' || value === 'N/A') {
    return fallback;
  }
  return String(value);
}

function getRiskColor(colorName: string): [number, number, number] {
  if (colorName === 'green') return [34, 197, 94];
  if (colorName === 'yellow') return [234, 179, 8];
  if (colorName === 'orange') return [249, 115, 22];
  return [239, 68, 68];
}

export async function exportLaudo(
  reportData: SecurityReport,
  selectedAgent: string,
  agents: Agent[] | undefined,
) {
  const QRCode = await import('qrcode');
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
  const logoDataUrl = await loadLogoForPDF();

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 0;

  // Generate unique laudo ID and dates
  const laudoId = crypto.randomUUID().substring(0, 8).toUpperCase();
  const generatedDate = new Date(reportData.generated_at);
  const validUntilDate = new Date(generatedDate);
  validUntilDate.setDate(validUntilDate.getDate() + 30);

  const dateStrFull = generatedDate.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  });
  const validUntilStr = validUntilDate.toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  });

  // QR code
  const verificationUrl = `https://cybershield.com.br/verificar/${laudoId}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
    width: 100, margin: 1, color: { dark: '#0f172a', light: '#ffffff' },
  });

  // Data extraction
  const riskScore = reportData.risk_score ?? 0;
  const riskClass = reportData.risk_classification || {
    level: 'Não calculado', color: 'gray', description: 'Aguardando análise de segurança',
  };
  const stats = reportData.statistics;
  const unprotected = reportData.unprotected_pcs || { no_antivirus: 0, outdated_av: 0, offline_agents: 0 };
  const riskColor = getRiskColor(riskClass.color);

  // ==================== PAGE 1: COVER ====================
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

  // ==================== PAGE 2: EXECUTIVE SUMMARY ====================
  doc.addPage();
  yPos = 20;

  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });

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

  // "O QUE ISSO SIGNIFICA" section
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

  // ==================== METHODOLOGY ====================
  if (yPos > pageHeight - 60) { doc.addPage(); yPos = 25; }

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. METODOLOGIA DE ANÁLISE', 14, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  ['Este laudo foi elaborado seguindo padrões internacionais de segurança da informação.',
    'A metodologia CyberShield combina coleta automatizada com análise inteligente de dados.'].forEach(line => {
    doc.text(line, 14, yPos);
    yPos += 5;
  });
  yPos += 5;

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, yPos, pageWidth - 28, 28, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Padrões de Referência:', 20, yPos + 8);
  doc.setFont('helvetica', 'normal');
  doc.text('• ISO 27001 - Gestão de Segurança da Informação', 20, yPos + 15);
  doc.text('• NIST Cybersecurity Framework', 100, yPos + 15);
  doc.text('• CVE (Common Vulnerabilities and Exposures)', 20, yPos + 22);
  doc.text('• LGPD - Lei Geral de Proteção de Dados', 100, yPos + 22);
  yPos += 35;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Verificações Realizadas:', 14, yPos);
  yPos += 6;

  const verifications = [
    ['1.', 'Inventário de software instalado em todos os endpoints'],
    ['2.', 'Varredura de vulnerabilidades conhecidas (base CVE/NVD)'],
    ['3.', 'Verificação de status e atualização do antivírus'],
    ['4.', 'Análise de atividade web e domínios acessados'],
    ['5.', 'Monitoramento de tentativas de acesso suspeitas'],
    ['6.', 'Correlação de eventos de segurança'],
  ];

  doc.setFont('helvetica', 'normal');
  verifications.forEach(([num, text]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(num, 18, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(text, 25, yPos);
    yPos += 5;
  });
  yPos += 5;

  doc.setFillColor(254, 249, 195);
  doc.roundedRect(14, yPos, pageWidth - 28, 18, 3, 3, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(113, 63, 18);
  doc.text('Limitações:', 20, yPos + 7);
  doc.setFont('helvetica', 'normal');
  doc.text('Este laudo reflete o estado no momento da geração. Novas vulnerabilidades podem surgir após a emissão.', 20, yPos + 13);
  doc.setTextColor(15, 23, 42);
  yPos += 25;

  // ==================== FINDINGS ====================
  doc.addPage();
  yPos = 25;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('3. ACHADOS DE SEGURANÇA', 14, yPos);
  yPos += 12;

  // 3.1 Vulnerabilities
  if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
    doc.setFontSize(14);
    doc.text('3.1 Vulnerabilidades Detectadas', 14, yPos);
    yPos += 8;

    const vulnData = reportData.data.vulnerabilities.slice(0, 20).map((v) => [
      formatValue(v.severity, 'Desconhecido').toUpperCase(),
      formatValue(v.title || v.check_key, 'Sem título').substring(0, 35),
      formatValue(v.description, 'Sem descrição').substring(0, 50),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Severidade', 'Título', 'Descrição']],
      body: vulnData,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38] },
      styles: { fontSize: 8 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      didParseCell: (data: any) => {
        if (data.column.index === 0 && data.section === 'body') {
          const sev = data.cell.raw?.toString().toLowerCase();
          if (sev === 'critical') data.cell.styles.textColor = [220, 38, 38];
          else if (sev === 'high') data.cell.styles.textColor = [249, 115, 22];
        }
      },
      margin: { left: 14, right: 14 },
    });
    yPos = doc.lastAutoTable.finalY + 12;
  } else {
    doc.setFontSize(14);
    doc.text('3.1 Vulnerabilidades Detectadas', 14, yPos);
    yPos += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 197, 94);
    doc.text('✓ Nenhuma vulnerabilidade detectada', 14, yPos);
    doc.setTextColor(15, 23, 42);
    yPos += 12;
  }

  // 3.2 Unprotected PCs
  if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('3.2 Computadores Desprotegidos', 14, yPos);
  yPos += 8;

  if (unprotected.no_antivirus > 0 || unprotected.outdated_av > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Situação', 'Quantidade', 'Ação Recomendada']],
      body: [
        ['Sem Antivírus', formatValue(unprotected.no_antivirus, '0'), 'Instalar solução antivírus'],
        ['Antivírus Desatualizado', formatValue(unprotected.outdated_av, '0'), 'Atualizar definições de vírus'],
        ['Offline', formatValue(unprotected.offline_agents, '0'), 'Verificar conectividade'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    yPos = doc.lastAutoTable.finalY + 12;
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 197, 94);
    doc.text('✓ Todos os computadores estão protegidos', 14, yPos);
    doc.setTextColor(15, 23, 42);
    yPos += 12;
  }

  // 3.3 Antivirus Status
  if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
  if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3.3 Status do Antivírus', 14, yPos);
    yPos += 8;

    const avData = reportData.data.antivirus_status.slice(0, 15).map((av) => [
      formatValue(av.engine_name, 'Desconhecido'),
      formatValue(av.status, 'Desconhecido'),
      formatValue(av.threats_found, '0'),
      av.last_update_at ? formatBrazilDateTime(String(av.last_update_at), 'date') : 'Não disponível',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Engine', 'Status', 'Ameaças', 'Última Atualização']],
      body: avData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    yPos = doc.lastAutoTable.finalY + 12;
  }

  // 3.4 Failed Login Attempts
  if (reportData.data?.failed_login_attempts && reportData.data.failed_login_attempts.length > 0) {
    if (yPos > pageHeight - 80) { doc.addPage(); yPos = 25; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3.4 Tentativas de Login Suspeitas', 14, yPos);
    yPos += 8;

    const loginData = reportData.data.failed_login_attempts.slice(0, 15).map((f) => [
      formatValue(f.email, 'Não informado'),
      formatValue(f.ip_address, 'Não identificado'),
      formatBrazilDateTime(String(f.created_at), 'full'),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Email', 'IP', 'Data/Hora']],
      body: loginData,
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });
    yPos = doc.lastAutoTable.finalY + 12;
  }

  // ==================== RECOMMENDATIONS ====================
  doc.addPage();
  yPos = 25;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`LAUDO DE SEGURANÇA - Nº ${laudoId}`, pageWidth / 2, 10, { align: 'center' });

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

  // ==================== CONCLUSION ====================
  if (yPos > pageHeight - 100) { doc.addPage(); yPos = 25; }

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

  // ==================== CERTIFICATION SEAL ====================
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

  // Page numbers
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages} | CyberShield Security Platform | Documento confidencial`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const agentName = selectedAgent === 'all' ? 'todos' : agents?.find(a => a.id === selectedAgent)?.agent_name || selectedAgent;
  doc.save(`laudo-seguranca-${agentName}-${new Date().toISOString().split('T')[0]}.pdf`);
}
