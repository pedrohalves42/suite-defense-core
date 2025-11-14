# Troubleshooting Guide - Dashboards CyberShield

## 🔍 Problemas Comuns e Soluções

### 1. Dashboard Não Carrega (Tela em Branco)

**Sintomas:**
- Tela branca após login
- Loading infinito
- Nenhum erro visível

**Soluções:**
1. **Verificar Console do Navegador:**
   - Abrir DevTools (F12)
   - Verificar erros de rede ou JavaScript
   - Procurar por erros 401, 403, 500

2. **Verificar Permissões:**
   - Confirmar que usuário tem role `admin`
   - Verificar em `user_roles` table no backend
   - Testar com usuário super_admin

3. **Limpar Cache:**
   - CTRL+SHIFT+R (hard refresh)
   - Limpar localStorage: `localStorage.clear()`
   - Testar em aba anônima

---

### 2. "Erro ao Carregar Dados" Aparece

**Sintomas:**
- Card vermelho com mensagem de erro
- Botão "Tentar Novamente" visível

**Causas Comuns:**
1. **Edge Function Offline:**
   - Verificar status em Lovable Cloud → Functions
   - Checar logs da função específica
   - Validar que função foi deployada

2. **Timeout de Query:**
   - Reduzir `hours_back` (de 168h para 24h)
   - Verificar índices SQL criados
   - Checar performance no Supabase Dashboard

3. **RLS Policy Blocking:**
   - Verificar policies em `v_agent_lifecycle_state`
   - Confirmar que `current_user_tenant_id()` retorna valor correto
   - Testar query diretamente no SQL Editor

**Como Resolver:**
```typescript
// 1. Clicar "Tentar Novamente"
// 2. Se persistir, abrir console (F12) e verificar erro detalhado
// 3. Reportar erro com screenshot e console log
```

---

### 3. Métricas Desatualizadas ou Incorretas

**Sintomas:**
- KPIs não batem com realidade
- Números zerados quando deveria ter dados
- Taxa de sucesso = 0% mas agentes estão ativos

**Diagnóstico:**
```sql
-- Verificar se view está retornando dados
SELECT COUNT(*) FROM v_agent_lifecycle_state 
WHERE tenant_id = 'seu-tenant-id';

-- Verificar se métricas estão calculando corretamente
SELECT * FROM calculate_pipeline_metrics('seu-tenant-id', 24);

-- Verificar installation_analytics
SELECT event_type, success, COUNT(*) 
FROM installation_analytics 
WHERE tenant_id = 'seu-tenant-id' 
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type, success;
```

**Soluções:**
1. Aguardar 1 minuto (refetch automático)
2. Mudar período (1h → 24h → 1h) para forçar reload
3. Verificar se há dados em `installation_analytics`

---

### 4. Exportação CSV Falha

**Sintomas:**
- Clica "Exportar CSV" mas nada acontece
- Arquivo baixa vazio
- Caracteres estranhos (encoding)

**Soluções:**
1. **Nenhum Dado para Exportar:**
   - Verificar se filtros não estão muito restritivos
   - Toast deve mostrar "Nenhum dado para exportar"
   - Limpar filtros e tentar novamente

2. **Encoding UTF-8:**
   - Abrir CSV no VS Code ou Notepad++
   - Verificar encoding (deve ser UTF-8)
   - Excel pode ter problemas - usar "Importar de CSV" ao invés de abrir diretamente

3. **Escape de Caracteres:**
   - Campos com vírgulas devem estar entre aspas
   - Aspas duplas devem ser escapadas (`""`)
   - Quebras de linha devem funcionar

**Validação:**
```typescript
// Exemplo de linha correta no CSV:
"Agent-01",installed,"Instalação concluída","Windows 11",2025-11-14
"Agent-02",failed,"Erro: Não foi possível ""conectar"" ao servidor","Linux",2025-11-14
```

---

### 5. Heartbeats em Tempo Real Não Aparecem

**Sintomas:**
- Card "Heartbeats Live" sempre em 0
- Nenhum toast de "Heartbeat recebido"
- Agentes estão ativos mas nada aparece

**Diagnóstico:**
```sql
-- Verificar se agentes estão enviando heartbeats
SELECT agent_name, last_heartbeat, 
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER / 60 as minutes_ago
FROM agents 
WHERE tenant_id = 'seu-tenant-id'
ORDER BY last_heartbeat DESC;
```

**Soluções:**
1. **Realtime Subscription Não Conectou:**
   - Abrir console do navegador
   - Procurar por `Realtime connection established`
   - Se não aparecer, recarregar página

2. **Filtro de Tenant Incorreto:**
   - Verificar se `tenant?.id` está definido
   - Checar se há múltiplos tenants e filtro está errado

3. **Agentes Não Estão Enviando:**
   - Verificar logs do agente Python
   - Confirmar que endpoint de heartbeat está respondendo
   - Testar manualmente: `POST /functions/v1/heartbeat`

---

### 6. Filtros Não Funcionam

**Sintomas:**
- Seleciona "Apenas Falhas" mas continua mostrando sucessos
- Busca por nome não retorna nada
- Data range não filtra corretamente

**Soluções:**
1. **Aguardar Debounce:**
   - Filtros de texto têm delay de 500ms
   - Esperar antes de verificar resultados

2. **Case Sensitivity:**
   - Busca de agente é case-sensitive
   - Usar nome exato (maiúsculas/minúsculas)

3. **Verificar Query:**
   - Abrir Network tab (F12)
   - Ver request para `installation_analytics`
   - Confirmar que filtros estão nos query params

---

### 7. Performance Degradada (Lentidão)

**Sintomas:**
- Dashboard demora >5s para carregar
- Scroll lento na tabela
- Browser travando

**Soluções:**
1. **Reduzir Período de Análise:**
   - Mudar de "Última semana" para "Últimas 24 horas"
   - Isso reduz quantidade de dados processados

2. **Verificar Índices SQL:**
```sql
-- Confirmar que índices foram criados
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('agents', 'installation_analytics')
  AND indexname LIKE 'idx_%';

-- Deve retornar:
-- idx_agents_tenant_enrolled
-- idx_agents_tenant_heartbeat
-- idx_agents_tenant_status
-- idx_installation_analytics_agent_event
-- idx_installation_analytics_tenant_created
-- idx_installation_analytics_success
-- idx_installation_analytics_command_copied
```

3. **Limitar Registros:**
   - Em `InstallationLogsExplorer`, limit é 100
   - Se precisar de mais, implementar paginação

4. **Desativar Realtime Temporariamente:**
   - Em `AgentHealthMonitor`, comentar subscription
   - Usar polling a cada 30s ao invés de realtime

---

### 8. Alertas de Taxa de Falha Não Disparam

**Sintomas:**
- Taxa > 30% mas nenhum alerta em `SystemLogs`
- Cron job configurado mas não executa
- Nenhum email recebido

**Diagnóstico:**
```sql
-- Verificar se cron job está ativo
SELECT * FROM cron.job 
WHERE jobname = 'alert-high-failure-rate-15min';

-- Verificar execuções recentes
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'alert-high-failure-rate-15min')
ORDER BY start_time DESC LIMIT 5;

-- Verificar se há falhas suficientes
SELECT * FROM check_installation_failure_rate(NULL, 1, 30.0);
```

**Soluções:**
1. **Cron Job Não Configurado:**
   - Executar SQL de configuração via `supabase--insert`
   - Verificar extensões `pg_cron` e `pg_net`

2. **Threshold Não Atingido:**
   - Requer mínimo 3 tentativas
   - Verificar se há instalações suficientes

3. **Alerta Já Existe:**
   - Edge Function evita duplicados
   - Marcar alerta antigo como `resolved = true`

4. **Email Não Configurado:**
```sql
-- Verificar configuração de email
SELECT enable_email_alerts, alert_email 
FROM tenant_settings 
WHERE tenant_id = 'seu-tenant-id';

-- Se NULL, configurar:
UPDATE tenant_settings 
SET enable_email_alerts = true, alert_email = 'seu@email.com'
WHERE tenant_id = 'seu-tenant-id';
```

---

## 🚀 Quando Executar "Tentar Novamente"

**Situações Recomendadas:**
- ✅ Erro temporário de rede
- ✅ Timeout de query (pode ter sido momentâneo)
- ✅ Após corrigir configurações (ex: ativar RLS policy)

**Situações NÃO Recomendadas:**
- ❌ Erro persiste após 3 tentativas (problema estrutural)
- ❌ Erro 403 Forbidden (problema de permissões)
- ❌ Erro de validação (input inválido)

---

## 📊 Performance Expectations

### Tempos de Resposta Esperados

| Dashboard | Carga Inicial | Filtro Aplicado | Refresh |
|-----------|---------------|-----------------|---------|
| Installation Pipeline | <1s | <500ms | <1s |
| Agent Health Monitor | <1s | <300ms | <1s |
| Installation Logs Explorer | <2s | <1s | <2s |

**Se os tempos estão >3x mais lentos:**
1. Verificar se índices SQL foram criados
2. Reduzir período de análise
3. Verificar saúde do Supabase (Dashboard → Health)

---

## 🔧 Ferramentas de Debug

### 1. Console Logs
```javascript
// Abrir console (F12)
// Procurar por:
console.error() // Erros da aplicação
console.warn() // Avisos de performance
```

### 2. Network Tab
```
// Filtrar por:
- "functions/v1" → Edge Functions
- "rest/v1" → Queries Supabase
- Status 4xx/5xx → Erros
```

### 3. Query do Edge Function
```typescript
// Copiar request do Network tab
// Testar diretamente via curl:
curl -X POST 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-installation-pipeline-metrics' \
  -H 'Authorization: Bearer SEU_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id": "seu-uuid", "hours_back": 24}'
```

### 4. SQL Direct Query
```sql
-- Testar view diretamente
SELECT * FROM v_agent_lifecycle_state 
WHERE tenant_id = 'seu-tenant-id' 
LIMIT 10;

-- Verificar performance
EXPLAIN ANALYZE
SELECT * FROM v_agent_lifecycle_state 
WHERE tenant_id = 'seu-tenant-id';
-- Deve usar "Index Scan", não "Seq Scan"
```

---

## 📞 Suporte Avançado

Se nenhuma solução acima resolver:

1. **Coletar Informações:**
   - Screenshot do erro
   - Console logs completos (F12 → Console → copy all)
   - Network requests com falha (F12 → Network)
   - Tenant ID e user ID

2. **Verificar Status do Sistema:**
   - Lovable Cloud status page
   - Supabase status page
   - GitHub Actions (se build em andamento)

3. **Abrir Issue com:**
   - Descrição detalhada do problema
   - Passos para reproduzir
   - Logs coletados
   - Versão do navegador e OS

---

**Última atualização:** 2025-11-14  
**Versão:** 1.0.0  
**Equipe:** Orion DataFlow PRIME
