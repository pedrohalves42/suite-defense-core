import { formatBrazilDateTime } from '@/lib/date-utils';
import { loadLogoForPDF, addLogoToPDF } from '@/lib/pdfLogoHelper';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import type { EnrichedActivity } from './types';

export async function exportWebActivityPDF(
  filteredActivity: EnrichedActivity[],
  totalHits: number,
  blockedCount: number,
) {
  if (!filteredActivity.length) {
    toast.error('Nenhum dado para exportar');
    return;
  }
  try {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const logoDataUrl = await loadLogoForPDF();

    addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 8, 16);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Atividade Web', pageWidth / 2, 32, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${formatBrazilDateTime(new Date().toISOString())}`, pageWidth / 2, 39, { align: 'center' });
    doc.text(`Total: ${filteredActivity.length} domínios | ${totalHits} acessos | ${blockedCount} bloqueados`, pageWidth / 2, 45, { align: 'center' });

    autoTable(doc, {
      startY: 52,
      head: [['Domínio', 'Categoria', 'Acessos', 'Primeiro Acesso', 'Último Acesso', 'Status']],
      body: filteredActivity.map(item => [
        item.domain,
        item.category?.name || 'Desconhecido',
        String(item.hits),
        formatBrazilDateTime(item.first_seen_at),
        formatBrazilDateTime(item.last_seen_at),
        item.isBlocked ? 'Bloqueado' : 'Permitido',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: { 0: { cellWidth: 60 }, 2: { halign: 'center', cellWidth: 20 }, 5: { cellWidth: 25 } },
    });

    doc.save(`relatorio-web-activity-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Relatório PDF exportado com sucesso');
  } catch (err) {
    logger.error('PDF export error:', err);
    toast.error('Erro ao exportar PDF');
  }
}

export async function exportSitePDF(domain: string, siteData: EnrichedActivity) {
  try {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const logoDataUrl = await loadLogoForPDF();

    addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 8, 16);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Site Individual', pageWidth / 2, 32, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em: ${formatBrazilDateTime(new Date().toISOString())}`, pageWidth / 2, 39, { align: 'center' });

    let yPos = 52;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(domain, 14, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    const details = [
      ['Categoria', siteData.category?.name || 'Desconhecido'],
      ['Total de Acessos', String(siteData.hits)],
      ['Primeiro Acesso', formatBrazilDateTime(siteData.first_seen_at)],
      ['Último Acesso', formatBrazilDateTime(siteData.last_seen_at)],
      ['Status', siteData.isBlocked ? '🔴 Bloqueado' : '🟢 Permitido'],
    ];

    for (const [label, value] of details) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${label}:`, 14, yPos);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(value, 60, yPos);
      yPos += 8;
    }

    yPos += 10;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, yPos, pageWidth - 14, yPos);
    yPos += 8;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('CyberShield — Relatório gerado automaticamente', pageWidth / 2, yPos, { align: 'center' });

    doc.save(`relatorio-site-${domain.replace(/[^a-zA-Z0-9.-]/g, '_')}-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success(`PDF do site ${domain} exportado`);
  } catch (err) {
    logger.error('Site PDF export error:', err);
    toast.error('Erro ao exportar PDF do site');
  }
}
