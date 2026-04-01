import type { Tutorial } from './types';

/** Tutoriais: relatorios */
export const tutorials_relatorios: Tutorial[] = [
  {
    id: "reports-export",
    title: "Relatórios, Laudos Verificáveis e Exportação",
    description: "Gere relatórios executivos em PDF, exporte dados em CSV/Excel, crie laudos com hash verificável e automatize entregas.",
    category: "relatorios",
    difficulty: "intermediate",
    estimatedTime: "12 min",
    tags: ["relatórios", "PDF", "CSV", "Excel", "laudos", "auditoria"],
    steps: [
      {
        title: "Relatório Executivo PDF — Conteúdo e customização",
        content: "O relatório executivo inclui: capa com logotipo e data, resumo executivo (2 parágrafos com principais achados), KPIs do período (com gráficos de tendência), top 10 ameaças detectadas com detalhes, status de compliance por política, lista de agentes problemáticos, recomendações automáticas da IA (priorizadas por impacto) e footer com hash de integridade.",
        scenario: "Exemplo: CTO gera relatório mensal para o board. O PDF de 12 páginas mostra: compliance de 91% (↑5% vs. mês anterior), 23 ameaças detectadas e remediadas (100% resolução), 2 recomendações da IA implementadas e ROI estimado de R$ 45.000 em incidentes prevenidos.",
      },
      {
        title: "Exportação CSV com filtros aplicados",
        content: "Cada tab do dashboard tem botão 'Exportar CSV'. O CSV respeita os filtros aplicados: se você filtrou 'agentes offline dos últimos 7 dias', o CSV conterá apenas esses dados. Colunas incluem todos os campos visíveis + campos técnicos adicionais (IDs, timestamps UTC, hashes). Encoding: UTF-8 BOM (compatível com Excel).",
      },
      {
        title: "Exportação Excel avançada (.xlsx)",
        content: "Para análises complexas, exporte em Excel: múltiplas abas (Resumo, Agentes, Jobs, Ameaças, Compliance), gráficos embutidos, formatação condicional (células vermelhas para problemas), filtros automáticos e tabela dinâmica pronta para uso. Gerado via ExcelJS com template profissional.",
      },
      {
        title: "Laudos com hash verificável publicamente",
        content: "Cada relatório gera um laudo com: código único (ex: LAUDO-2026-0313-ABC123), hash SHA-256 do conteúdo (garante que não foi adulterado), QR Code com link de verificação e assinatura digital do sistema. Qualquer pessoa pode verificar em /verificar-laudo inserindo o código — útil para auditores, reguladores e processos legais.",
        tip: "Ao enviar relatórios para auditoria externa, sempre inclua o link de verificação do laudo. Isso demonstra profissionalismo e garante a integridade do documento.",
      },
      {
        title: "Automação de entregas (relatórios agendados)",
        content: "Admin → Relatórios → 'Agendar Entrega'. Configure: tipo de relatório, frequência (diário, semanal, mensal), destinatários (e-mails), formato (PDF/Excel) e filtros. Exemplo: 'Relatório executivo PDF mensal para cto@empresa.com no dia 1 de cada mês às 8h'.",
      },
    ],
  },

];
