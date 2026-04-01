import type { Tutorial } from './types';

/** Tutoriais: dashboard */
export const tutorials_dashboard: Tutorial[] = [
  {
    id: "dashboard-overview",
    title: "Dashboard Completo — Guia Avançado",
    description: "Domine todos os KPIs, gráficos interativos, timeline de segurança, widgets customizáveis e filtros compartilháveis do dashboard.",
    category: "dashboard",
    difficulty: "beginner",
    estimatedTime: "15 min",
    tags: ["dashboard", "métricas", "KPIs", "gráficos", "widgets", "filtros"],
    videoId: "dashboard-overview",
    realWorldScenarios: [
      { title: "SOC monitorando 200 agentes", description: "O analista de SOC usa o dashboard customizado com layout 3 colunas: KPIs no topo, gráficos de tendência no meio e timeline de ameaças na lateral. Filtro salvo: 'últimas 24h, apenas severidade alta/crítica'." },
      { title: "CTO preparando relatório mensal", description: "O CTO acessa o dashboard com filtro de 30 dias, exporta os KPIs e gráficos como PDF executivo para apresentar ao board. Usa o link compartilhável para enviar a visão exata aos diretores." },
    ],
    steps: [
      {
        title: "Cards de KPI — Entendendo cada métrica",
        content: "4 cards principais no topo: (1) Total de Agentes — mostra online/offline com %, alerta se >10% offline. (2) Taxa de Sucesso de Jobs — % de jobs concluídos com sucesso nas últimas 24h, seta verde/vermelha indicando tendência. (3) Ameaças Detectadas — total com breakdown por severidade (crítica em vermelho, alta em laranja, média em amarelo, baixa em azul). (4) Jobs Ativos — quantidade em execução neste momento com barra de progresso agregada.",
        tip: "Clique em qualquer card de KPI para navegar diretamente à página detalhada. Ex: clicar em 'Ameaças Detectadas' leva à Quarentena com filtro de ameaças ativas.",
        scenario: "Exemplo: Card 'Ameaças Detectadas' mostra '7 (↑3)' — significa 7 ameaças ativas, 3 a mais que ontem. O vermelho indica que há pelo menos 1 crítica. Clique para investigar.",
      },
      {
        title: "Gráficos de tendência — Análise temporal",
        content: "3 gráficos interativos: (1) Instalações vs. Desinstalações — linha temporal mostrando crescimento líquido de agentes. (2) Detecções por Tipo — barras empilhadas: trojan, ransomware, PUP, adware, rootkit. (3) Volume de Jobs — área mostrando jobs executados com breakdown sucesso/falha. Todos suportam zoom (click+drag), hover para valores exatos e exportação PNG.",
        tip: "Seletores de período: 7d (operacional diário), 30d (relatório mensal), 90d (tendência trimestral), Custom (qualquer range). Para análise de incidentes, use 24h ou Custom com horário específico.",
      },
      {
        title: "Timeline humanizada de eventos",
        content: "A timeline lateral exibe eventos em linguagem natural com contexto: 'DESKTOP-MARIA detectou Trojan.GenericKD.12345 (severidade: CRÍTICA) há 15 min — quarentena automática aplicada', 'Job scan-completo-semanal finalizado: 45 agentes processados, 2 ameaças encontradas'. Cores por severidade: vermelho = crítico, laranja = alto, amarelo = médio, azul = info.",
        scenario: "Exemplo real: Às 14:32, o timeline mostra: '⚠️ SERVIDOR-DB01 — Anomalia comportamental detectada: aumento de 340% em operações de escrita em disco. Investigação recomendada.' O operador clica e vê os detalhes do baseline comportamental.",
      },
      {
        title: "Tabs especializadas com dados granulares",
        content: "5 tabs abaixo dos gráficos: (1) Agentes — tabela paginada com busca, filtro por status/grupo/SO, colunas ordenáveis. (2) Jobs — histórico com filtro por tipo/status/agente. (3) Relatórios — PDFs gerados com download direto. (4) Evidências — log de auditoria imutável com hash. (5) Segurança — ameaças ativas, quarentena e alertas pendentes. Cada tab tem seu próprio botão de exportação CSV.",
      },
      {
        title: "Layout customizável com drag-and-drop",
        content: "Clique no ícone de cadeado (🔒) no canto superior direito para desbloquear edição. Os widgets ganham handles de arraste (cantos) e redimensionamento (bordas). Arraste para reorganizar, redimensione puxando bordas. Widgets disponíveis: KPIs, Gráficos, Timeline, Mapa de Agentes, Top Ameaças, Status de Compliance. O layout é salvo automaticamente por usuário.",
        tip: "Crie layouts diferentes para funções diferentes: SOC Analyst (foco em ameaças), Manager (foco em KPIs e compliance), Engineer (foco em agentes e jobs). Cada usuário salva seu próprio layout.",
      },
      {
        title: "Filtros compartilháveis via URL",
        content: "Todos os filtros são sincronizados com a URL via query parameters: ?tab=seguranca&q=ransomware&status=critico&periodo=7d. Copie a URL para compartilhar uma visão filtrada exata com colegas. Crie bookmarks no navegador para visões que você acessa frequentemente.",
        code: "# Exemplos de URLs com filtros:\n/dashboard?tab=agentes&status=offline\n/dashboard?tab=seguranca&severidade=critica&periodo=24h\n/dashboard?tab=jobs&tipo=scan&status=failed&periodo=7d\n\n# Compartilhe com colegas — eles verão exatamente a mesma visão filtrada",
        tip: "Salve como bookmarks no navegador: 'Dashboard - Ameaças Críticas 24h', 'Dashboard - Agentes Offline', 'Dashboard - Jobs Falhos Semana'.",
      },
    ],
    troubleshooting: [
      {
        problem: "Gráficos não carregam ou mostram dados vazios",
        cause: "Período selecionado sem dados (ex: 7 dias com tenant recém-criado) ou cache do navegador corrompido.",
        solution: "1) Mude o período para '30d' ou 'Todos'. 2) Limpe cache: Ctrl+Shift+Delete → Cache de imagens e arquivos. 3) Tente em aba anônima. Se persistir, verifique se há agentes online reportando dados.",
      },
      {
        problem: "Layout customizado voltou ao padrão",
        cause: "Limpeza de dados do navegador removeu o localStorage ou login com conta diferente.",
        solution: "O layout é salvo por perfil de usuário. Faça login com a conta correta. Se os dados foram limpos, reconfigure o layout — ele será salvo automaticamente novamente.",
      },
    ],
  },

];
