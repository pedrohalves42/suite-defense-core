import { formatBrazilDateTime } from '@/lib/date-utils';
import type { SecurityReport, Agent } from './types';

export async function exportBasicPDF(
  reportData: SecurityReport,
  selectedAgent: string,
  agents: Agent[] | undefined,
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
  const logoDataUrl = await loadLogoForPDF();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;

  // Header with dark background
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 50, 'F');
  addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 2, 16);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CYBERSHIELD', pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório de Segurança', pageWidth / 2, 28, { align: 'center' });

  doc.setFontSize(10);
  const dateStr = formatBrazilDateTime(reportData.generated_at, 'full');
  doc.text(`Gerado em: ${dateStr}`, pageWidth / 2, 38, { align: 'center' });

  yPos = 55;

  // Filter info
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  const filterText = reportData.agent_filter === 'all' ? 'Todos os Agentes' : `Agente: ${reportData.agent_filter}`;
  doc.text(`Filtro: ${filterText}`, 14, yPos);
  yPos += 10;

  // Executive Summary
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('SUMÁRIO EXECUTIVO', 14, yPos);
  yPos += 8;

  const summaryData = [
    ['Agentes Ativos', String(reportData.statistics.total_agents)],
    ['Software Inventariado', String(reportData.statistics.total_software)],
    ['Vulnerabilidades', String(reportData.statistics.total_vulnerabilities)],
    ['Vulnerab. Críticas', String(reportData.statistics.critical_vulnerabilities)],
    ['Vulnerab. Altas', String(reportData.statistics.high_vulnerabilities)],
    ['Engines Antivírus', String(reportData.statistics.antivirus_engines)],
    ['Ameaças Detectadas', String(reportData.statistics.threats_found)],
    ['Domínios Únicos', String(reportData.statistics.unique_domains)],
    ['Scans Maliciosos', `${reportData.statistics.malicious_scans}/${reportData.statistics.total_scans}`],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Métrica', 'Valor']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' } },
    margin: { left: 14, right: 14 },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  // Software Inventory
  if (reportData.data?.software_inventory && reportData.data.software_inventory.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('INVENTÁRIO DE SOFTWARE', 14, yPos);
    yPos += 6;

    const softwareData = reportData.data.software_inventory.slice(0, 20).map((sw) => [
      (String(sw.name || '')).substring(0, 30),
      (String(sw.version || '-')).substring(0, 15),
      (String(sw.vendor || '-')).substring(0, 20),
      String(sw.risk_level || 'unknown'),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Nome', 'Versão', 'Fornecedor', 'Risco']],
      body: softwareData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 3: { cellWidth: 25, halign: 'center' } },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 12;

    if (reportData.data.software_inventory.length > 20) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`... e mais ${reportData.data.software_inventory.length - 20} aplicações`, 14, yPos);
      yPos += 10;
    }
  }

  // Vulnerabilities
  if (reportData.data?.vulnerabilities && reportData.data.vulnerabilities.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('VULNERABILIDADES DETECTADAS', 14, yPos);
    yPos += 6;

    const vulnData = reportData.data.vulnerabilities.slice(0, 15).map((vuln) => [
      String(vuln.severity || '-'),
      String(vuln.title || vuln.check_key || '-').substring(0, 35),
      String(vuln.description || '-').substring(0, 40),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Severidade', 'Título', 'Descrição']],
      body: vulnData,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 25, halign: 'center' } },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 12;
  }

  // Antivirus Status
  if (reportData.data?.antivirus_status && reportData.data.antivirus_status.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('STATUS DO ANTIVÍRUS', 14, yPos);
    yPos += 6;

    const avData = reportData.data.antivirus_status.map((av) => [
      String(av.engine_name || '-'),
      String(av.engine_version || '-'),
      String(av.status || '-'),
      String(av.threats_found || '0'),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Engine', 'Versão', 'Status', 'Ameaças']],
      body: avData,
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 12;
  }

  // Web Activity
  if (reportData.data?.web_activity && reportData.data.web_activity.length > 0) {
    if (yPos > pageHeight - 60) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('ATIVIDADE WEB (Top 30 Domínios)', 14, yPos);
    yPos += 6;

    const webData = reportData.data.web_activity.slice(0, 30).map((web) => [
      String(web.domain || '-').substring(0, 40),
      String(web.source || '-'),
      formatBrazilDateTime(String(web.visited_at), 'date'),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Domínio', 'Fonte', 'Data']],
      body: webData,
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      margin: { left: 14, right: 14 },
    });

    yPos = doc.lastAutoTable.finalY + 12;
  }

  // Footer
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages} | CyberShield Security Platform | www.cybershield.com.br`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  const agentName = selectedAgent === 'all' ? 'todos' : agents?.find(a => a.id === selectedAgent)?.agent_name || selectedAgent;
  doc.save(`relatorio-seguranca-${agentName}-${new Date().toISOString().split('T')[0]}.pdf`);
}
