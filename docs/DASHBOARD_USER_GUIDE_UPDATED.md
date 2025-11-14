# Guia do Usuário - Dashboards CyberShield

## 📊 Visão Geral dos Dashboards

O CyberShield possui 3 dashboards principais para monitoramento operacional:

1. **Installation Pipeline Monitor** - Acompanhe o funil de instalação de agentes
2. **Agent Health Monitor** - Monitore a saúde dos agentes em tempo real
3. **Installation Logs Explorer** - Busca avançada de logs e troubleshooting

---

## 🎯 Installation Pipeline Monitor

### O Que Você Vê

**KPIs Principais (Cards):**
- **Taxa de Sucesso:** % de instalações bem-sucedidas (meta: >80%)
- **Agentes Ativos:** Quantos agentes estão enviando heartbeats
- **Tempo Médio:** Tempo médio de instalação em segundos (meta: <60s)
- **Taxa de Conversão:** % de gerados que chegam a instalados (meta: >50%)
- **Agentes Travados:** Instalações que levaram >30min sem conclusão

**Funil de Instalação:**
Visualização do pipeline completo:
1. **Gerados** - Instaladores criados
2. **Baixados** - Downloads realizados
3. **Comando Copiado** - PowerShell/Bash copiado para área de transferência
4. **Instalados** - Scripts executados com sucesso
5. **Ativos** - Agentes enviando heartbeats

**⚠️ Card de Alta Taxa de Falha (Quando Aparece):**
- **Condição:** >30% de falhas na última hora (mínimo 3 tentativas)
- **Cor:** Vermelho (border e badge)
- **Ação:** Clicar "Ver Logs de Falha" para investigar

### Como Usar

#### Alterar Período de Análise
1. Clicar dropdown no topo direito
2. Selecionar: Última hora, 6h, 24h, 3 dias, 1 semana
3. Métricas atualizam automaticamente

#### Filtrar Agentes por Estágio
1. Na seção "Agentes", clicar dropdown "Filtrar por estágio"
2. Opções:
   - **Todos** - Sem filtro
   - **Ativos** - Enviando heartbeats
   - **Instalando** - Em processo de instalação
   - **Travados** - >30min sem conclusão
   - **Com Erros** - Falhas registradas

#### Exportar Dados para Excel
1. Aplicar filtros desejados
2. Clicar "Exportar CSV" (topo da tabela)
3. Arquivo `agents-pipeline-2025-11-14.csv` será baixado
4. Abrir no Excel:
   - Dados → Obter Dados → De Arquivo CSV
   - Encoding: UTF-8

**Colunas Exportadas:**
- Nome do Agente
- Estágio no Ciclo de Vida
- Status Atual
- Tempo de Instalação (segundos)
- Última Visibilidade
- Está Travado? (Sim/Não)
- Tem Erros? (Sim/Não)

---

## ❤️ Agent Health Monitor

### O Que Você Vê

**KPIs de Saúde:**
- **Saúde Geral:** % de agentes saudáveis (meta: >90%)
- **Heartbeats Live:** Contador de heartbeats recebidos nesta sessão
- **Agentes por Status:**
  - 🟢 **Saudáveis** - Ativos, sem erros
  - 🟡 **Atenção** - Offline ou com warning
  - 🔴 **Crítico** - Com erros ou travados

**Heatmap de Agentes:**
Visualização em tempo real dos agentes agrupados por saúde.

### Como Usar

#### Monitorar Heartbeats em Tempo Real
1. Dashboard atualiza automaticamente a cada heartbeat
2. **Toast de Notificação** aparece quando heartbeat é recebido:
   - "❤️ Heartbeat recebido"
   - "Agente: NOME-DO-AGENTE"
3. **Contador Live** incrementa a cada notificação

#### Identificar Agentes Críticos
1. Procurar badges **vermelhos** na lista
2. Agentes críticos têm:
   - Ícone `AlertCircle` vermelho
   - Última visibilidade >5 minutos
   - Mensagem de erro visível
3. Clicar no agente para ver detalhes

#### Agrupar por Status de Saúde
1. Cards mostram contagem por status
2. Clicar no card para filtrar apenas aquele status
3. Exemplo: Clicar "Crítico (3)" → exibe só os 3 agentes críticos

---

## 🔍 Installation Logs Explorer

### O Que Você Vê

**Filtros Avançados:**
- **Nome do Agente** - Busca textual
- **Tipo de Evento** - generated, downloaded, command_copied, post_installation
- **Status** - Todos, Sucessos, Falhas
- **Plataforma** - Todos, Windows, Linux
- **Tipo de Erro** - Busca textual (ex: "401", "TLS", "proxy")
- **Data Inicial/Final** - Range de datas

**Tabela de Logs:**
- Timestamp
- Nome do Agente
- Evento
- Sucesso/Falha (badge colorido)
- Plataforma
- Erro (se houver)
- Botão "Detalhes"

### Como Usar

#### Buscar Instalações com Falha
1. **Filtro por Status:** Selecionar "Apenas Falhas"
2. **Filtro por Tipo de Erro:** Digite "401" para erros de autenticação
3. **Ordenação:** Logs mais recentes aparecem primeiro
4. **Exportar:** Clicar "Exportar CSV" para análise offline

#### Ver Detalhes de um Log
1. Clicar botão "Detalhes" na linha do log
2. **Sheet lateral abre** com:
   - Metadata completa (JSON)
   - Stack trace (se erro)
   - System info (hostname, OS, PowerShell version)
   - Logs stdout/stderr do instalador
3. Copiar JSON para análise técnica

#### Investigar Padrão de Erros
**Cenário:** 10 instalações falharam hoje

**Passos:**
1. Filtrar por `success=false`, `dateFrom=hoje`
2. Verificar coluna "Erro" → procurar padrões:
   - Se **todos** têm "401": problema de autenticação/token
   - Se **maioria** tem "TLS": problema de certificados
   - Se **aleatórios**: problema de rede/infraestrutura
3. Clicar "Detalhes" em 2-3 logs diferentes
4. Comparar `metadata.system_info` → procurar commonalities:
   - Mesma versão de OS?
   - Mesmo hostname/datacenter?
   - Mesmo horário do dia?

---

## 🚨 Interpretando Alertas

### Alerta: "Alta Taxa de Falha nas Instalações"

**O Que Significa:**
- Mais de 30% das instalações falharam na última hora
- Severidade:
  - **Medium** (⚠️ amarelo): 30-50% de falhas
  - **High** (🔴 vermelho): >50% de falhas

**Quando Aparece:**
- Card vermelho no **Installation Pipeline Monitor**
- Notificação em **System Alerts** (`/admin/system-logs`)
- Email (se configurado em Settings)

**O Que Fazer:**

1. **Investigar Causa Raiz:**
   - Clicar "Ver Logs de Falha" no card de alerta
   - Analise os logs no Logs Explorer
   - Identificar erro mais comum (401, TLS, proxy, etc.)

2. **Ações Corretivas por Tipo de Erro:**

   **Erro 401 (Unauthorized):**
   - Token de enrollment expirado → Gerar novo instalador
   - Problema de sincronização → Verificar `agent_tokens` table
   - Edge Function `/enroll-agent` com problema → Verificar logs

   **Erro TLS/SSL:**
   - Certificado expirado no servidor
   - Firewall corporativo bloqueando HTTPS
   - Orientar usuário a instalar certificado ou desativar proxy

   **Erro "Null Expression":**
   - Bug no PowerShell script
   - Variável não inicializada
   - Reportar ao suporte com stack trace

   **Erro de Proxy:**
   - Configuração de proxy corporativo
   - Usuário precisa adicionar `proxy.company.com` nas exceções
   - Ou passar `-Proxy` no comando de instalação

3. **Marcar Alerta como Resolvido:**
   - Ir para **System Logs** (`/admin/system-logs`)
   - Localizar alerta de "Alta Taxa de Falha"
   - Clicar "Resolver" (marca como `resolved=true`)
   - Adicionar nota sobre ação tomada

4. **Monitorar Melhoria:**
   - Aguardar 1 hora
   - Verificar se taxa de falha caiu
   - Se continuar alta, escalar para suporte técnico

---

## 💾 Exportação de Dados

### Quando Exportar

**Cenários Comuns:**
- Análise mensal de performance (Excel)
- Relatório para gerência (CSV → PowerPoint)
- Auditoria de segurança (logs de falha)
- Troubleshooting offline (quando dashboard está lento)

### Como Exportar

#### Logs de Instalação
1. Abrir **Installation Logs Explorer**
2. Aplicar filtros (período, plataforma, sucesso/falha)
3. Clicar "Exportar CSV (X logs)"
4. Arquivo baixado: `installation-logs-YYYY-MM-DD.csv`

**Colunas Exportadas:**
- Nome do Agente
- Tipo de Evento
- Sucesso (Sim/Não)
- Plataforma
- Mensagem de Erro
- Data/Hora (formato BR: dd/MM/yyyy HH:mm:ss)

#### Lista de Agentes
1. Abrir **Installation Pipeline Monitor**
2. Filtrar por estágio (ex: "Travados")
3. Clicar "Exportar CSV"
4. Arquivo baixado: `agents-pipeline-YYYY-MM-DD.csv`

**Colunas Exportadas:**
- Nome do Agente
- Estágio do Ciclo de Vida
- Status
- Tempo de Instalação (s)
- Última Visibilidade
- Travado? / Com Erros?

### Abrindo CSV no Excel

**Método Correto (preserva UTF-8):**
1. Excel → Dados → Obter Dados Externos → De Arquivo de Texto/CSV
2. Selecionar arquivo `.csv`
3. **Configurações:**
   - Origem do Arquivo: **Unicode (UTF-8)**
   - Delimitador: **Vírgula**
   - Tipo de Dados: **Automático**
4. Carregar

**Não Use:** Duplo-clique no arquivo (quebra acentos)

---

## 🔄 Atualizações em Tempo Real

### Dashboard com Realtime Habilitado

**Agent Health Monitor:**
- Atualiza a cada heartbeat (sem refresh manual)
- Toast de notificação: "❤️ Heartbeat recebido"
- Contador "Heartbeats Live" incrementa automaticamente

**Installation Pipeline Monitor:**
- Polling automático a cada 60 segundos
- Sem necessidade de refresh manual
- Indicador visual de "Atualizando..." (spinner discreto)

**Installation Logs Explorer:**
- Atualiza ao aplicar filtros
- Sem polling (apenas sob demanda)
- Para ver novos logs: aplicar filtro ou clicar "Limpar → Buscar"

---

## ⚠️ Troubleshooting Rápido

### "Nenhum Dado para Exportar"
**Causa:** Filtros muito restritivos ou nenhum dado disponível

**Solução:** Limpar filtros e verificar se há dados no período selecionado

---

### Loading Infinito
**Causa:** Edge Function com timeout ou erro

**Solução:** 
1. Aguardar 30s
2. Se persistir, clicar "Tentar Novamente"
3. Se continuar, recarregar página (CTRL+R)

---

### Heartbeats Não Aparecem
**Causa:** Realtime subscription não conectou

**Solução:**
1. Verificar console do navegador (F12)
2. Procurar por erro de WebSocket
3. Recarregar página
4. Se persistir, verificar firewall corporativo (porta 443 WebSocket)

---

### Métricas Desatualizadas
**Causa:** Cache ou período de análise inadequado

**Solução:**
1. Mudar período (ex: 24h → 1h → 24h) para forçar refresh
2. Aguardar 1 minuto (refetch automático)
3. CTRL+SHIFT+R (hard refresh)

---

## 🎓 Casos de Uso Práticos

### Caso 1: "10 Instalações Falharam Hoje"

**Objetivo:** Descobrir por que e corrigir

**Passo a Passo:**
1. Abrir **Installation Logs Explorer**
2. Filtros:
   - Status: "Apenas Falhas"
   - Data Inicial: Hoje (00:00)
3. Verificar coluna "Erro" → identificar padrão
4. **Se maioria tem erro 401:**
   - Ir para **Enrollment Keys** (`/admin/enrollment-keys`)
   - Verificar se key está expirada
   - Gerar nova key
   - Orientar usuários a baixar novo instalador
5. **Se erros variados (TLS, proxy, etc.):**
   - Exportar CSV
   - Enviar para equipe de infra/rede
   - Investigar configurações de proxy/firewall

---

### Caso 2: "Agente Ficou Offline"

**Objetivo:** Identificar se é problema de rede, agent crashed ou servidor down

**Passo a Passo:**
1. Abrir **Agent Health Monitor**
2. Localizar agente com badge "⚠️ Atenção" ou "🔴 Crítico"
3. Verificar "Última Visibilidade":
   - **<5 minutos:** Provavelmente rede instável (aguardar)
   - **>5 minutos:** Agente pode ter crashado ou servidor desligado
4. Clicar no agente para ver métricas:
   - CPU, memória, disco
   - Se métricas antigas (>15min): servidor desligado
5. **Ações:**
   - Reiniciar serviço do agente
   - Verificar logs do sistema operacional
   - Se persistir, reinstalar agente

---

### Caso 3: "Taxa de Falha >30% - Alerta Recebido"

**Objetivo:** Resolver rapidamente antes que mais instalações falhem

**Passo a Passo:**
1. **Abrir Installation Pipeline Monitor**
2. Card vermelho "Alta Taxa de Falha Detectada" está visível
3. Anotar:
   - Taxa: ex: 45%
   - Total de tentativas: ex: 20
   - Falhas: ex: 9
4. Clicar **"Ver Logs de Falha"**
5. Analisar os 5 logs mais recentes:
   - Todos têm mesmo erro? → Problema sistêmico
   - Erros variados? → Problema de rede/infraestrutura
6. **Resolver com base no erro:**
   - **401:** Regenerar tokens
   - **TLS:** Atualizar certificados
   - **Proxy:** Orientar configuração de proxy
7. **Marcar como Resolvido:**
   - Ir para `/admin/system-logs`
   - Localizar alerta
   - Clicar "Resolver"
   - Adicionar nota: "Tokens regenerados - problema resolvido"

---

### Caso 4: "Relatório Mensal de Instalações"

**Objetivo:** Gerar relatório executivo para gerência

**Passo a Passo:**
1. **Installation Pipeline Monitor:**
   - Período: "Últimos 30 dias" (usar 720 horas se disponível)
   - Anotar KPIs:
     - Taxa de sucesso
     - Total instalado
     - Tempo médio
2. **Exportar Dados:**
   - Clicar "Exportar CSV"
   - Arquivo: `agents-pipeline-2025-11.csv`
3. **Análise no Excel:**
   - Criar tabela dinâmica
   - Agrupar por semana
   - Gráfico de evolução de taxa de sucesso
4. **Logs de Falhas:**
   - Abrir **Logs Explorer**
   - Filtrar: Apenas falhas, último mês
   - Exportar CSV
   - Criar gráfico de "Top 5 Erros Mais Frequentes"

---

## 🎨 Interpretando Cores e Badges

### Badges de Status

| Cor | Significado | Ação Recomendada |
|-----|-------------|------------------|
| 🟢 Verde (Ativo) | Agente funcionando normalmente | Nenhuma ação |
| 🟡 Amarelo (Atenção) | Offline <5min ou instalando | Aguardar ou verificar |
| 🔴 Vermelho (Erro) | Falha crítica, erro registrado | Investigar logs |
| ⚪ Cinza (Desconhecido) | Estado indefinido | Verificar dados |

### Cards de KPI

| Valor | Interpretação | Ação |
|-------|---------------|------|
| Taxa Sucesso >80% | 🟢 Excelente | Manter monitoramento |
| Taxa Sucesso 50-80% | 🟡 Atenção | Investigar causas |
| Taxa Sucesso <50% | 🔴 Crítico | Ação imediata |
| Tempo Médio <60s | 🟢 Bom | Nenhuma ação |
| Tempo Médio >120s | 🟡 Lento | Otimizar instalador |
| Travados >5 | 🔴 Problema | Verificar timeout/network |

---

## 🛠️ Manutenção Preventiva

### Checklist Semanal

**Segunda-feira (15min):**
- [ ] Abrir **Installation Pipeline Monitor**
- [ ] Verificar taxa de sucesso da semana passada (meta: >80%)
- [ ] Verificar se há agentes travados (meta: 0)
- [ ] Exportar CSV e salvar para histórico

**Quarta-feira (10min):**
- [ ] Abrir **Agent Health Monitor**
- [ ] Verificar % de saúde geral (meta: >90%)
- [ ] Identificar agentes em "Atenção" (>5min offline)
- [ ] Verificar se heartbeats estão chegando (contador live >0)

**Sexta-feira (20min):**
- [ ] Abrir **Installation Logs Explorer**
- [ ] Filtrar falhas da semana
- [ ] Identificar top 3 erros mais frequentes
- [ ] Criar plano de ação para resolver na próxima semana
- [ ] Limpar alertas resolvidos em **System Logs**

---

## 📞 Quando Escalar para Suporte

**Escalar Imediatamente Se:**
- ❌ Taxa de falha >50% por mais de 1 hora
- ❌ Dashboard completamente inacessível (erro 500 persistente)
- ❌ Nenhum agente consegue instalar (100% de falhas)
- ❌ Alertas duplicados disparando continuamente

**Escalar em 24h Se:**
- ⚠️ Taxa de falha entre 30-50% por mais de 4 horas
- ⚠️ >10 agentes travados simultaneamente
- ⚠️ Performance degradada (dashboard >5s para carregar)
- ⚠️ Heartbeats pararam de chegar (todos os agentes)

**Informações a Incluir no Ticket:**
1. Screenshot do erro
2. CSV exportado dos logs de falha
3. Tenant ID e período de ocorrência
4. Ações já tomadas (tentativas de resolução)
5. Console logs do navegador (F12 → Console → Copy All)

---

## 📚 Recursos Adicionais

**Documentação Técnica:**
- `DATA_FLOW_ARCHITECTURE.md` - Arquitetura e fluxos
- `TROUBLESHOOTING_DASHBOARDS.md` - Troubleshooting avançado
- `PHASE_3_4_5_IMPLEMENTATION.md` - Detalhes técnicos das fases

**Testes Automatizados:**
- `e2e/dashboard-*.spec.ts` - Testes E2E
- `e2e/README-dashboard-tests.md` - Guia de execução

**Guias de Operação:**
- `TELEMETRY_ERROR_TESTING.md` - Validar telemetria de erros
- `INSTALLATION_GUIDE.md` - Guia de instalação do agente

---

**Versão:** 2.0.0  
**Última Atualização:** 2025-11-14  
**Equipe:** Orion DataFlow PRIME  
**Feedback:** Envie sugestões para melhorar este guia!
