# Guia de Usuário - Dashboards CyberShield

## Visão Geral

Este guia explica como usar os dashboards Orion DataFlow do CyberShield para monitorar e gerenciar a instalação e operação de agentes.

## 📊 Installation Pipeline Monitor

**Caminho**: Admin → Pipeline Instalação

### O que é?
Dashboard que mostra o funil completo de instalação de agentes, desde a geração do instalador até o agente ativo.

### Métricas Principais

#### Taxa de Sucesso
- **O que significa**: Percentual de agentes que completaram a instalação com sucesso
- **Fórmula**: (Instalados / Comando Copiado) × 100
- **Meta**: > 85%
- **Como melhorar**: 
  - Verifique logs de agentes travados
  - Corrija problemas de rede/TLS
  - Atualize instruções de instalação

#### Agentes Ativos
- **O que significa**: Número de agentes enviando heartbeats nos últimos 5 minutos
- **Status saudável**: Todos os agentes instalados devem estar ativos
- **Ação se baixo**: Verifique conectividade de rede e firewalls

#### Tempo Médio
- **O que significa**: Tempo médio de instalação (em segundos)
- **Meta**: < 120s
- **Se alto**: Pode indicar problemas de performance na rede ou servidor

#### Conversão
- **O que significa**: Percentual de instaladores gerados que resultaram em agentes instalados
- **Meta**: > 70%
- **Se baixo**: Usuários podem não estar executando os scripts ou enfrentando erros

#### Travados
- **O que significa**: Agentes com comando copiado há > 30min sem conclusão
- **Ação imediata**: Investigar logs, contatar usuário, verificar firewall

### Funil de Instalação

Visualização gráfica mostrando quantos agentes passaram por cada etapa:

1. **Gerados**: Instaladores criados no dashboard
2. **Baixados**: Scripts baixados pelo usuário
3. **Comando Copiado**: Usuário copiou o comando de instalação
4. **Instalados**: Script executado com sucesso
5. **Ativos**: Agente enviando heartbeats

### Tabela de Agentes

Cada linha mostra:
- **Nome**: Nome único do agente
- **Status**: Badge colorido indicando estado atual
- **Pipeline**: Ícones visuais mostrando progresso no funil
- **Tempo**: Tempo de instalação (se concluído)
- **Último Visto**: Timestamp do último heartbeat
- **Ações**: Botões para ver logs ou tentar reinstalar

#### Cores de Status
- 🟢 Verde (Ativo): Heartbeat recente (< 5min)
- 🟡 Amarelo (Travado): Comando copiado há > 30min
- 🔴 Vermelho (Erro): Falha na instalação
- ⚪ Cinza (Offline): Instalado mas sem heartbeat

### Filtros
- **Todos**: Mostra todos os agentes
- **Ativos**: Apenas agentes com heartbeat recente
- **Instalando**: Agentes no processo de instalação
- **Travados**: Agentes que podem precisar de intervenção
- **Com Erros**: Agentes com falhas registradas

### Período de Análise
- Última hora
- Últimas 6 horas
- Últimas 24 horas (padrão)
- Últimos 3 dias
- Última semana

## ❤️ Agent Health Monitor

**Caminho**: Admin → Saúde Agentes

### O que é?
Dashboard em tempo real mostrando a saúde de todos os agentes com visualização tipo "heatmap".

### Métricas Live

#### Saúde Geral
- **O que significa**: Percentual de agentes saudáveis
- **Cálculo**: (Agentes Ativos / Total de Agentes) × 100
- **Cores**:
  - 🟢 > 80%: Saudável
  - 🟡 50-80%: Atenção
  - 🔴 < 50%: Crítico

#### Heartbeats Live
- **O que significa**: Contador de heartbeats recebidos nesta sessão
- **Atualização**: Realtime via Supabase
- **Notificação**: Toast aparece quando heartbeat é recebido
- **Uso**: Verificar se agentes estão comunicando

#### Alertas Ativos
- **O que significa**: Número de agentes com problemas críticos
- **Inclui**: Erros, instalações travadas, timeouts
- **Ação**: Clicar para ver detalhes no card "Críticos"

#### Avisos
- **O que significa**: Agentes temporariamente offline
- **Critério**: Heartbeat entre 5-30 minutos atrás
- **Ação**: Monitorar, pode voltar naturalmente

### Heartbeats Recentes
Card mostrando os últimos 5 agentes que enviaram heartbeat, com animação pulse.

### Mapa de Calor
Grid 8×8 mostrando todos os agentes como quadrados coloridos:

- 🟢 Verde: Saudável (heartbeat < 5min)
- 🟡 Amarelo: Aviso (heartbeat 5-30min)
- 🔴 Vermelho: Crítico (erro ou travado)
- ⚪ Cinza: Offline (heartbeat > 30min)

**Interação**: Hover sobre quadrado mostra tooltip com:
- Nome do agente
- Status atual
- Timestamp do último visto

### Cards de Grupos

#### Saudáveis
Lista os agentes com status OK, mostrando os 5 primeiros + contador de quantos mais existem.

#### Avisos
Agentes que podem precisar de atenção, ordenados por tempo offline.

#### Críticos
Agentes que requerem ação imediata:
- Erros de instalação
- Instalações travadas
- Falhas de autenticação
- Problemas de rede

## 🔍 Installation Logs Explorer

**Caminho**: Admin → Logs Instalação

### O que é?
Busca avançada de todos os eventos de instalação com drill-down para detalhes completos.

### Filtros Disponíveis

#### Nome do Agente
Busca parcial (ex: "srv" encontra "srv-001", "srv-002")

#### Tipo de Evento
- **Gerado**: Instalador criado
- **Baixado**: Script baixado
- **Comando Copiado**: Usuário copiou comando
- **Instalado**: Instalação verificada
- **Instalado (Não Verificado)**: Instalação sem HMAC
- **Falhado**: Erro durante instalação

#### Status
- **Sucesso**: Instalação bem-sucedida
- **Falha**: Erro ocorreu
- **Todos**: Sem filtro

#### Plataforma
- **Windows**: Scripts PowerShell
- **Linux**: Scripts Bash
- **Todas**: Sem filtro

#### Tipo de Erro
Busca livre para encontrar erros específicos:
- `401`: Problemas de autenticação
- `TLS`: Erros de certificado SSL/TLS
- `proxy`: Problemas de proxy
- `timeout`: Timeouts de rede
- `script`: Erros no script PowerShell/Bash

#### Período
- **De**: Data inicial
- **Até**: Data final

### Tabela de Resultados

Cada linha mostra:
- **Data/Hora**: Timestamp do evento (formato: dd/MM/yy HH:mm:ss)
- **Agente**: Nome do agente
- **Evento**: Badge colorido com tipo do evento
- **Plataforma**: Windows ou Linux
- **Status**: ✅ Sucesso / ❌ Falha / ⚠️ N/A
- **Tempo**: Tempo de instalação (se aplicável)
- **Rede**: Status da conectividade de rede
- **Ações**: Botão para ver detalhes completos

### Drill-Down de Detalhes

Clicar no botão de ações abre painel lateral com:

#### Informações Básicas
- Tipo de evento
- Plataforma
- Sucesso/falha
- Tempo de instalação

#### Erro (se houver)
Mensagem de erro completa em destaque vermelho.

#### Metadata
JSON completo com todos os dados capturados:
- Testes de rede realizados
- Versões de sistema operacional
- Logs stdout/stderr (quando disponível)
- HMAC validation status
- Request ID para rastreamento

### Ações em Lote

#### Exportar CSV
Exporta os logs filtrados para arquivo CSV com todas as colunas.

## 📋 System Logs

**Caminho**: Super Admin → Logs Sistema

### O que é?
Visualização de alertas do sistema e logs de segurança, com foco em eventos de cron jobs e detecção de problemas.

### Filtros

#### Tipo de Alerta
- **Agentes Pendentes**: Alertas de `check-pending-agents`
- **Instalações Travadas**: Alertas de `detect-stuck-installations`
- **Execução Cron**: Logs de execução de jobs agendados
- **Email Enviado**: Confirmação de envio de emails de alerta

#### Severidade
- **Info**: Informacional
- **Baixa**: Requer monitoramento
- **Média**: Requer atenção
- **Alta**: Requer ação em breve
- **Crítica**: Requer ação imediata

#### Status
- **Pendente**: Alert não resolvido
- **Resolvido**: Alert marcado como resolvido

#### Período
Filtros de data para análise temporal.

### Interpretação de Alertas

#### Agentes Pendentes
- **Quando**: Agentes criados mas sem heartbeat por X minutos
- **Ação**: Verificar se usuário executou instalação, verificar logs

#### Instalações Travadas
- **Quando**: Comando copiado há > 30min sem conclusão
- **Ação**: Contatar usuário, verificar logs de telemetria, checar firewall

#### Execução Cron
- **Quando**: Cron job foi executado
- **Uso**: Auditoria de automações, troubleshooting

## 🎯 Casos de Uso Comuns

### Caso 1: Taxa de sucesso baixa (< 70%)

1. Acesse **Installation Pipeline Monitor**
2. Verifique métrica "Taxa de Sucesso"
3. Filtre por "Com Erros"
4. Identifique padrão de erro (401, TLS, proxy)
5. Acesse **Installation Logs Explorer**
6. Filtre por tipo de erro encontrado
7. Analise metadata dos logs
8. Corrija problema identificado (documentação, script, firewall)

### Caso 2: Agentes ficam travados

1. Acesse **Installation Pipeline Monitor**
2. Verifique métrica "Travados" (deve ser 0)
3. Filtre tabela por "Travados"
4. Identifique agentes afetados
5. Acesse **Installation Logs Explorer**
6. Busque por nome do agente
7. Veja último evento registrado
8. Verifique se:
   - Script foi executado (deve ter evento "comando_copiado")
   - Houve erro de rede (checar campo network_connectivity)
   - Houve erro de auth (checar erro 401)
9. Contate usuário para reexecutar ou verifique firewall

### Caso 3: Agentes offline

1. Acesse **Agent Health Monitor**
2. Verifique "Saúde Geral" (deve ser > 80%)
3. Veja card "Avisos" (agentes temporariamente offline)
4. Se persistir por > 1h, vá para card "Críticos"
5. Identifique agente específico
6. Verifique "Último Visto" no Pipeline Monitor
7. Se > 24h, considere:
   - Máquina desligada
   - Problema de rede
   - Agente removido

### Caso 4: Investigar erro específico

1. Acesse **Installation Logs Explorer**
2. Use filtro "Tipo de Erro" (ex: "401")
3. Defina período de análise
4. Ordene por data (mais recente primeiro)
5. Clique em log para ver detalhes
6. Analise metadata → error_details
7. Identifique root cause
8. Documente solução

## 🔔 Notificações e Alertas

### Alertas Automáticos

#### Email
- **Quando**: Agentes pendentes > 30min ou travados detectados
- **Para**: Admins do tenant afetado
- **Frequência**: Uma vez ao detectar, não repete

#### Toast (Browser)
- **Quando**: Heartbeat recebido (apenas em Agent Health Monitor)
- **Duração**: 2 segundos
- **Uso**: Feedback visual de atividade

### Configurar Alertas

1. Acesse **Admin → Config Tenant → Settings**
2. Habilite "Email Alerts"
3. Configure emails dos destinatários
4. Escolha tipos de alerta:
   - Agentes pendentes
   - Instalações travadas
   - Taxa de falha alta
   - Agentes offline

## 📈 Métricas de Sucesso

### KPIs Recomendados

| Métrica | Meta | Crítico |
|---------|------|---------|
| Taxa de Sucesso | > 85% | < 50% |
| Tempo Médio Instalação | < 120s | > 300s |
| Agentes Travados | 0 | > 5 |
| Saúde Geral | > 80% | < 60% |
| Conversão (Gerado→Instalado) | > 70% | < 40% |

### Monitoramento Proativo

1. **Diariamente**: Verificar Agent Health Monitor
2. **Semanalmente**: Analisar tendências no Pipeline Monitor
3. **Mensalmente**: Exportar e analisar logs para padrões
4. **Sempre**: Resolver alertas críticos em < 1h

## 🆘 Troubleshooting

### Dashboard não carrega

1. Verifique conexão com internet
2. Abra console do navegador (F12)
3. Procure por erros de API
4. Verifique autenticação (token expirado?)
5. Limpe cache e recarregue

### Métricas inconsistentes

1. Force refresh (Ctrl+Shift+R)
2. Verifique filtros aplicados
3. Confirme período de análise
4. Verifique RLS policies no Supabase
5. Consulte logs de Edge Functions

### Realtime não funciona

1. Verifique Agent Health Monitor
2. Confirme que Supabase Realtime está habilitado
3. Verifique console por erros de WebSocket
4. Recarregue página
5. Verifique firewall/proxy bloqueando WebSocket

## 📚 Recursos Adicionais

- [Arquitetura de Fluxo de Dados](./DATA_FLOW_ARCHITECTURE.md)
- [Tipos TypeScript](../src/types/agent-lifecycle.ts)
- [Edge Functions](../supabase/functions/)
- [Documentação Supabase](https://supabase.com/docs)

## 🤝 Suporte

Para dúvidas ou problemas:
1. Consulte [TROUBLESHOOTING_GUIDE.md](../TROUBLESHOOTING_GUIDE.md)
2. Verifique logs no Installation Logs Explorer
3. Contate suporte técnico com Request ID dos logs
