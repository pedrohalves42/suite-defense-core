import type { LaudoContext } from './types';
import { checkPageBreak } from './helpers';

export function renderMethodology(ctx: LaudoContext): number {
  const { doc, pageWidth, pageHeight } = ctx;
  let yPos = checkPageBreak(doc, 999, pageHeight, 60); // force new section check

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

  return yPos;
}
