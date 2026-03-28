import { formatBrazilDateTime } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import type { ComplianceReportPayload } from "./types";
import { LAYMAN_DESCRIPTIONS } from "./types";

type RGBTuple = [number, number, number];

function getRiskColors(level: string): RGBTuple {
  switch (level) {
    case "BAIXO": return [22, 163, 74];
    case "MÉDIO": return [202, 138, 4];
    case "ALTO": return [234, 88, 12];
    case "CRÍTICO": return [220, 38, 38];
    default: return [107, 114, 128];
  }
}

export async function exportCompliancePdf(reportPayload: ComplianceReportPayload): Promise<string> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 0;

  // ==================== PAGE 1: COVER ====================
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  const { loadLogoForPDF, addLogoToPDF } = await import('@/lib/pdfLogoHelper');
  const logoDataUrl = await loadLogoForPDF();
  addLogoToPDF(doc, logoDataUrl, pageWidth / 2, 20, 36);

  doc.setFontSize(24);
  doc.text("RELATÓRIO DE COMPLIANCE", pageWidth / 2, 72, { align: "center" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "normal");
  doc.text(reportPayload.template_name, pageWidth / 2, 84, { align: "center" });

  doc.setFontSize(10);
  doc.text(reportPayload.template_description, pageWidth / 2, 94, { align: "center" });

  // Audit Info Box
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(20, 108, pageWidth - 40, 40, 4, 4, "F");

  doc.setFontSize(9);
  doc.text(`ID de Auditoria: ${reportPayload.audit_id}`, 30, 120);
  doc.text(`Emitido em: ${formatBrazilDateTime(reportPayload.generated_at, "full")} (UTC-3)`, 30, 130);
  doc.text(`Válido até: ${formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)`, 30, 140);

  // Risk Score
  const riskColor = getRiskColors(reportPayload.risk_level);
  doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
  doc.roundedRect(20, 155, pageWidth - 40, 30, 4, 4, "F");

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`NÍVEL DE RISCO: ${reportPayload.risk_level}`, pageWidth / 2, 167, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Score: ${reportPayload.risk_score}/100 - ${reportPayload.risk_description}`, pageWidth / 2, 178, { align: "center" });

  // SHA256 and HMAC
  doc.setFillColor(22, 101, 52);
  doc.roundedRect(20, 192, pageWidth - 40, 18, 4, 4, "F");
  doc.setFontSize(7);
  doc.text("SHA256 (Integridade): " + reportPayload.sha256, 25, 203);

  doc.setFillColor(30, 64, 175);
  doc.roundedRect(20, 214, pageWidth - 40, 18, 4, 4, "F");
  doc.text("HMAC-SHA256 (Assinatura): " + reportPayload.hmac_signature, 25, 225);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("CyberShield Security Platform - Laudo com Validade Jurídica", pageWidth / 2, pageHeight - 15, { align: "center" });

  // ==================== PAGE 2: EXECUTIVE SUMMARY ====================
  doc.addPage();
  yPos = 20;

  addPageHeader(doc, pageWidth, reportPayload.audit_id, reportPayload.template_name);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RESUMO EXECUTIVO", 14, yPos + 8);
  yPos += 18;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Este documento apresenta uma análise de segurança da sua infraestrutura de TI.", 14, yPos);
  yPos += 8;
  doc.text("Abaixo, explicamos em linguagem simples o que foi verificado e o resultado.", 14, yPos);
  yPos += 15;

  // What this report means box
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, yPos, pageWidth - 28, 55, 4, 4, "F");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("O QUE ESTE RELATÓRIO SIGNIFICA?", 20, yPos + 10);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const passedInvariants = reportPayload.invariants.filter(i => i.status === "PASS").length;
  const totalInvariants = reportPayload.invariants.length;
  const criticalVulns = reportPayload.statistics?.critical_vulnerabilities || 0;
  const highVulns = reportPayload.statistics?.high_vulnerabilities || 0;

  let summaryText = "";
  if (reportPayload.risk_level === "BAIXO") {
    summaryText = "Sua empresa está em boa situação de segurança. Os sistemas estão protegidos e funcionando corretamente.";
  } else if (reportPayload.risk_level === "MÉDIO") {
    summaryText = "Sua empresa possui alguns pontos de atenção que merecem acompanhamento, mas não há riscos críticos imediatos.";
  } else {
    summaryText = "Foram identificados pontos que precisam de atenção imediata. Recomendamos revisar as recomendações abaixo.";
  }

  doc.text(summaryText, 20, yPos + 22, { maxWidth: pageWidth - 48 });
  doc.text(`Verificamos ${totalInvariants} controles de segurança, e ${passedInvariants} estão em conformidade.`, 20, yPos + 38);
  doc.text(`Foram encontradas ${criticalVulns} vulnerabilidades críticas e ${highVulns} altas.`, 20, yPos + 48);

  yPos += 65;

  // Key highlights
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("PRINCIPAIS DESTAQUES", 14, yPos);
  yPos += 10;

  const highlights = [
    { text: `${reportPayload.statistics?.total_agents || 0} computadores monitorados`, color: [22, 163, 74] as RGBTuple },
    { text: criticalVulns > 0 ? `${criticalVulns} vulnerabilidades críticas encontradas` : "Nenhuma vulnerabilidade crítica", color: (criticalVulns > 0 ? [220, 38, 38] : [22, 163, 74]) as RGBTuple },
    { text: `${reportPayload.active_policies.length} políticas de segurança ativas`, color: [37, 99, 235] as RGBTuple },
    { text: `${passedInvariants}/${totalInvariants} controles de segurança conformes`, color: (passedInvariants === totalInvariants ? [22, 163, 74] : [202, 138, 4]) as RGBTuple },
  ];

  highlights.forEach((h) => {
    doc.setFillColor(h.color[0], h.color[1], h.color[2]);
    doc.circle(20, yPos + 2, 3, "F");
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(h.text, 28, yPos + 4);
    yPos += 10;
  });

  yPos += 10;

  // Recommendations
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("RECOMENDAÇÕES", 14, yPos);
  yPos += 10;

  const recommendations: string[] = [];
  if (criticalVulns > 0) recommendations.push("Corrigir vulnerabilidades críticas com urgência");
  if (highVulns > 0) recommendations.push("Revisar e corrigir vulnerabilidades de alta severidade");
  if (reportPayload.invariants.some(i => i.status === "FAIL")) recommendations.push("Verificar controles de segurança não conformes");
  if ((reportPayload.statistics?.threats_found || 0) > 0) recommendations.push("Investigar ameaças detectadas pelo antivírus");
  if (recommendations.length === 0) recommendations.push("Manter as boas práticas de segurança atuais");

  recommendations.forEach((r, idx) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${idx + 1}. ${r}`, 20, yPos);
    yPos += 8;
  });

  // ==================== PAGE 3: INVARIANTS ====================
  doc.addPage();
  yPos = 25;

  addPageHeader(doc, pageWidth, reportPayload.audit_id, reportPayload.template_name);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("1. CONTROLES DE SEGURANÇA VERIFICADOS", 14, yPos);
  yPos += 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Os controles abaixo garantem que sua empresa segue as melhores práticas de segurança.", 14, yPos);
  yPos += 10;

  const invariantData = reportPayload.invariants.map((inv) => [
    inv.status === "PASS" ? "✓" : inv.status === "FAIL" ? "✗" : "?",
    inv.name,
    LAYMAN_DESCRIPTIONS[inv.id] || inv.description,
    inv.status === "PASS" ? "Conforme" : inv.status === "FAIL" ? "Não Conforme" : "Pendente",
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["", "Controle", "O que significa", "Status"]],
    body: invariantData,
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 35 },
      2: { cellWidth: 95 },
      3: { cellWidth: 25, halign: "center" }
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data: Record<string, unknown>) => {
      const cell = data as { column: { index: number }; section: string; cell: { text: string[]; styles: { textColor: number[] } } };
      if (cell.column.index === 0 && cell.section === "body") {
        const text = cell.cell.text[0];
        if (text === "✓") cell.cell.styles.textColor = [22, 101, 52];
        else if (text === "✗") cell.cell.styles.textColor = [220, 38, 38];
        else cell.cell.styles.textColor = [202, 138, 4];
      }
      if (cell.column.index === 3 && cell.section === "body") {
        const text = cell.cell.text[0];
        if (text === "Conforme") cell.cell.styles.textColor = [22, 101, 52];
        else if (text === "Não Conforme") cell.cell.styles.textColor = [220, 38, 38];
        else cell.cell.styles.textColor = [202, 138, 4];
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  // ==================== SECTION 2: STATISTICS ====================
  if (yPos > pageHeight - 70) { doc.addPage(); yPos = 25; }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("2. NÚMEROS DO PERÍODO", 14, yPos);
  yPos += 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Resumo das métricas de segurança coletadas durante o período de análise.", 14, yPos);
  yPos += 10;

  const statsData = [
    ["Computadores Monitorados", `${reportPayload.statistics?.total_agents || 0}`, "Quantidade de máquinas com agente instalado"],
    ["Vulnerabilidades Críticas", `${reportPayload.statistics?.critical_vulnerabilities || 0}`, "Problemas graves que precisam de atenção imediata"],
    ["Vulnerabilidades Altas", `${reportPayload.statistics?.high_vulnerabilities || 0}`, "Problemas importantes que devem ser corrigidos"],
    ["Ameaças Detectadas", `${reportPayload.statistics?.threats_found || 0}`, "Vírus ou malware encontrados pelo antivírus"],
    ["Eventos de Segurança", `${reportPayload.statistics?.security_events || 0}`, "Ocorrências registradas pelo sistema"],
    ["Registros de Auditoria", `${reportPayload.statistics?.audit_logs || 0}`, "Ações registradas para fins de compliance"],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Métrica", "Valor", "O que significa"]],
    body: statsData,
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 25, halign: "center" }, 2: { cellWidth: 90 } },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  // ==================== SECTION 3: POLICIES ====================
  if (yPos > pageHeight - 60) { doc.addPage(); yPos = 25; }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("3. POLÍTICAS DE PROTEÇÃO ATIVAS", 14, yPos);
  yPos += 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Regras configuradas para proteger os usuários contra sites perigosos ou inadequados.", 14, yPos);
  yPos += 10;

  if (reportPayload.active_policies.length > 0) {
    const policyData = reportPayload.active_policies.map((p) => [
      p.domain_pattern,
      p.reason || "Política de segurança",
      p.is_active ? "Ativo" : "Inativo",
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Site/Padrão Bloqueado", "Motivo", "Status"]],
      body: policyData,
      theme: "striped",
      headStyles: { fillColor: [234, 88, 12], fontSize: 8 },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
  } else {
    doc.text("Nenhuma política de bloqueio configurada.", 14, yPos);
    yPos += 15;
  }

  // ==================== SECTION 4: TEMPLATE SECTIONS ====================
  if (yPos > pageHeight - 50) { doc.addPage(); yPos = 25; }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`4. SEÇÕES ${reportPayload.template_name.toUpperCase()}`, 14, yPos);
  yPos += 12;

  for (const section of reportPayload.sections) {
    if (yPos > pageHeight - 30) { doc.addPage(); yPos = 25; }

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, yPos, pageWidth - 28, 20, 2, 2, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(section.title, 18, yPos + 8);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${section.description} | ${section.record_count} registros analisados`, 18, yPos + 16);

    yPos += 25;
  }

  // ==================== GLOSSARY PAGE ====================
  doc.addPage();
  yPos = 25;

  addPageHeader(doc, pageWidth, reportPayload.audit_id, "Glossário");

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("GLOSSÁRIO DE TERMOS", 14, yPos);
  yPos += 12;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Explicação dos termos técnicos utilizados neste relatório.", 14, yPos);
  yPos += 15;

  const glossaryTerms = [
    ["SHA256", "Código único gerado a partir do documento. Se o documento for alterado, este código muda. Serve para verificar que o relatório não foi modificado."],
    ["HMAC", "Assinatura digital que comprova a origem do documento. Garante que o relatório foi gerado pelo sistema CyberShield."],
    ["RLS (Row Level Security)", "Tecnologia que garante que cada empresa só veja seus próprios dados, mesmo que compartilhem o mesmo banco de dados."],
    ["Vulnerabilidade", "Falha de segurança que pode ser explorada por atacantes. Vulnerabilidades críticas são as mais graves."],
    ["Malware/Vírus", "Programa malicioso que pode danificar seu computador ou roubar informações."],
    ["Agente", "Programa instalado nos computadores que coleta informações de segurança e aplica políticas de proteção."],
    ["Compliance", "Conformidade com normas e regulamentos de segurança da informação."],
    ["LGPD", "Lei Geral de Proteção de Dados - Lei brasileira que regulamenta o tratamento de dados pessoais."],
    ["ISO 27001", "Norma internacional para gestão de segurança da informação."],
    ["SOC2", "Padrão de segurança para empresas de tecnologia que processam dados de clientes."],
    ["Tenant", "Organização ou empresa dentro do sistema. Cada tenant tem seus dados isolados."],
    ["Auditoria", "Processo de verificação e registro de atividades para fins de compliance e segurança."],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Termo", "Explicação"]],
    body: glossaryTerms,
    theme: "striped",
    headStyles: { fillColor: [107, 114, 128], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 4 },
    margin: { left: 14, right: 14 },
    columnStyles: { 0: { cellWidth: 40, fontStyle: "bold" }, 1: { cellWidth: 130 } },
  });

  // ==================== CERTIFICATION PAGE ====================
  doc.addPage();
  yPos = 40;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("CERTIFICADO DE CONFORMIDADE", pageWidth / 2, yPos, { align: "center" });

  yPos += 25;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Este documento certifica que a organização "${reportPayload.tenant_name}"`, pageWidth / 2, yPos, { align: "center" });
  yPos += 8;
  doc.text(`foi avaliada conforme os critérios do template ${reportPayload.template_name}.`, pageWidth / 2, yPos, { align: "center" });

  yPos += 20;

  const certRiskColor = getRiskColors(reportPayload.risk_level);
  doc.setFillColor(certRiskColor[0], certRiskColor[1], certRiskColor[2]);
  doc.roundedRect(40, yPos, pageWidth - 80, 30, 4, 4, "F");
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`RESULTADO: ${reportPayload.risk_level}`, pageWidth / 2, yPos + 12, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Score de Risco: ${reportPayload.risk_score}/100`, pageWidth / 2, yPos + 24, { align: "center" });

  yPos += 45;

  doc.setFontSize(10);
  doc.text(`ID de Auditoria: ${reportPayload.audit_id}`, pageWidth / 2, yPos, { align: "center" });
  yPos += 8;
  doc.text(`Período: ${formatBrazilDateTime(reportPayload.period_start, "short")} - ${formatBrazilDateTime(reportPayload.period_end, "short")}`, pageWidth / 2, yPos, { align: "center" });
  yPos += 8;
  doc.text(`Válido até: ${formatBrazilDateTime(reportPayload.valid_until, "full")} (UTC-3)`, pageWidth / 2, yPos, { align: "center" });

  yPos += 25;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(25, yPos, pageWidth - 50, 55, 4, 4, "F");

  doc.setFontSize(9);
  doc.text("VERIFICAÇÃO DE INTEGRIDADE", 35, yPos + 12);
  doc.setFontSize(6);
  doc.text(`SHA256: ${reportPayload.sha256}`, 35, yPos + 22);
  doc.text(`HMAC: ${reportPayload.hmac_signature}`, 35, yPos + 32);
  doc.text(`Versão: ${reportPayload.format_version} | Gerador: ${reportPayload.generator}`, 35, yPos + 42);
  doc.setFontSize(7);
  doc.text("Para verificar a autenticidade, acesse: verificar.cyberservices.com.br", 35, yPos + 50);

  // Save PDF
  const filename = `compliance-${reportPayload.template.toLowerCase()}-${reportPayload.audit_id}.pdf`;
  doc.save(filename);

  return filename;
}

function addPageHeader(doc: InstanceType<typeof import('jspdf').default>, pageWidth: number, auditId: string, label: string) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(`${auditId} | ${label}`, pageWidth / 2, 9, { align: "center" });
}
