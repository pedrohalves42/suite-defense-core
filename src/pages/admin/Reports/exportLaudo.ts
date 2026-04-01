import type { SecurityReport, Agent } from './types';
import { getRiskColor } from './laudo/helpers';
import type { LaudoContext } from './laudo/types';
import { renderCover } from './laudo/renderCover';
import { renderExecutiveSummary } from './laudo/renderExecutiveSummary';
import { renderMethodology } from './laudo/renderMethodology';
import { renderFindings } from './laudo/renderFindings';
import { renderRecommendations } from './laudo/renderRecommendations';
import { renderConclusion } from './laudo/renderConclusion';

export async function exportLaudo(
  reportData: SecurityReport,
  selectedAgent: string,
  agents: Agent[] | undefined,
) {
  const QRCode = await import('qrcode');
  const { default: jsPDF } = await import('jspdf');
  const { loadLogoForPDF } = await import('@/lib/pdfLogoHelper');
  const logoDataUrl = await loadLogoForPDF();

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

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

  const ctx: LaudoContext = {
    doc, pageWidth, pageHeight, laudoId, dateStrFull, validUntilStr,
    riskScore, riskClass, riskColor, reportData, agents, qrCodeDataUrl,
    logoDataUrl, stats, unprotected,
  };

  // Render all sections
  renderCover(ctx);
  renderExecutiveSummary(ctx);
  renderMethodology(ctx);
  renderFindings(ctx);
  renderRecommendations(ctx);
  renderConclusion(ctx);

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
