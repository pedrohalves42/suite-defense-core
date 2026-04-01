import { formatBrazilDateTime } from '@/lib/date-utils';
import autoTable from 'jspdf-autotable';
import type { LaudoContext } from './types';
import { formatValue, addPageHeader, checkPageBreak } from './helpers';

export function renderFindings(ctx: LaudoContext): number {
  const { doc, pageWidth, pageHeight, laudoId, reportData, unprotected } = ctx;

  doc.addPage();
  let yPos = 25;

  addPageHeader(doc, laudoId, pageWidth);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('3. ACHADOS DE SEGURANÇA', 14, yPos);
  yPos += 12;

  // 3.1 Vulnerabilities
  yPos = renderVulnerabilities(doc, yPos, pageWidth, reportData);

  // 3.2 Unprotected PCs
  yPos = checkPageBreak(doc, yPos, pageHeight);
  yPos = renderUnprotectedPCs(doc, yPos, pageWidth, unprotected);

  // 3.3 Antivirus Status
  yPos = checkPageBreak(doc, yPos, pageHeight);
  yPos = renderAntivirusStatus(doc, yPos, reportData);

  // 3.4 Failed Login Attempts
  yPos = renderFailedLogins(doc, yPos, pageHeight, reportData);

  return yPos;
}

function renderVulnerabilities(
  doc: import('jspdf').default,
  yPos: number,
  pageWidth: number,
  reportData: LaudoContext['reportData'],
): number {
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
  return yPos;
}

function renderUnprotectedPCs(
  doc: import('jspdf').default,
  yPos: number,
  pageWidth: number,
  unprotected: LaudoContext['unprotected'],
): number {
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
  return yPos;
}

function renderAntivirusStatus(
  doc: import('jspdf').default,
  yPos: number,
  reportData: LaudoContext['reportData'],
): number {
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
  return yPos;
}

function renderFailedLogins(
  doc: import('jspdf').default,
  yPos: number,
  pageHeight: number,
  reportData: LaudoContext['reportData'],
): number {
  if (reportData.data?.failed_login_attempts && reportData.data.failed_login_attempts.length > 0) {
    yPos = checkPageBreak(doc, yPos, pageHeight);
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
  return yPos;
}
