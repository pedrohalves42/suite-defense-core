# Mapa de Políticas RLS - CyberShield

> **Gerado em:** 2025-12-11  
> **Versão:** 1.0  
> **Total de Tabelas:** 81+  
> **Cobertura RLS:** 100%

## Visão Geral das Roles

| Role | Descrição | Nível de Acesso |
|------|-----------|-----------------|
| `super_admin` | Administrador global do sistema | Acesso total cross-tenant |
| `admin` | Administrador do tenant | Gerenciamento completo do tenant |
| `operator` | Operador de segurança | Leitura + ações operacionais |
| `viewer` | Visualizador | Apenas leitura |
| `service_role` | Backend/Edge Functions | Operações de sistema |

---

## Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Acesso permitido |
| ❌ | Acesso negado |
| 🔒 | Restrito ao próprio tenant |
| 🌐 | Cross-tenant (super_admin) |
| ⚙️ | Apenas service_role |

---

## Tabelas Core

### `agents` - Agentes de Endpoint

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ✅ 🔒 | ❌ | ❌ | ✅ |
| UPDATE | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |

**Políticas:**
- `Super admins can view/update/delete agents` - Acesso total
- `Admins can manage agents in their tenant` - via `has_role()` + `current_user_tenant_id()`

---

### `enrollment_keys` - Chaves de Enrollment

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |

**Nota:** View `enrollment_keys_safe` mascara a coluna `key` sensível.

---

### `agent_tokens` - Tokens de Autenticação

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ✅ | ❌ | ❌ | ❌ | ✅ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ✅ |

**Políticas:**
- `Admins can view tokens in their tenant` - via join com `agents`
- INSERT bloqueado para usuários - apenas Edge Functions podem criar tokens

---

### `user_roles` - Roles de Usuário

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| UPDATE | ✅ | ✅ 🔒* | ❌ | ❌ | ✅ |
| DELETE | ✅ | ✅ 🔒* | ❌ | ❌ | ✅ |

**Nota:** *Atualização de roles deve usar `update_user_role_rpc()` que bloqueia escalação para `super_admin`.

---

### `profiles` - Perfis de Usuário

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ (próprio) | ✅ (próprio) | ✅ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ✅ |
| UPDATE | ✅ 🌐 | ✅ 🔒 | ✅ (próprio) | ✅ (próprio) | ✅ |
| DELETE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |

**Políticas:**
- `Users can view own profile` - `auth.uid() = user_id`
- `Users can update own profile` - `auth.uid() = user_id`
- `Admins can view profiles in tenant` - via join com `user_roles`

---

## Tabelas de Dados de Segurança

### `software_inventory` - Inventário de Software

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

### `vulnerabilities` - Vulnerabilidades Detectadas

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

### `antivirus_status` - Status de Antivírus

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

### `agent_web_activity` - Atividade Web

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

### `security_events` - Eventos de Segurança

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Tabelas de Métricas e Telemetria

### `agent_system_metrics` - Métricas de Sistema

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

**Nota:** Partições mensais (`agent_system_metrics_2025_12`, etc.) seguem a mesma política.

---

### `installation_analytics` - Analytics de Instalação

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

## Tabelas de Auditoria e Logs

### `audit_logs` - Logs de Auditoria

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ❌ |

**Segurança:** Logs são imutáveis. Nenhum role pode modificar ou deletar registros.

---

### `security_logs` - Logs de Segurança

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ❌ |

---

### `hmac_signatures` - Assinaturas HMAC (Anti-Replay)

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ❌ | ❌ | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ❌ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

**Segurança:** Tabela interna para prevenção de replay attacks. Sem acesso de usuário.

---

## Tabelas de Jobs e Operações

### `jobs` - Fila de Jobs

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |

---

### `failed_jobs_dlq` - Dead Letter Queue

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |

---

## Tabelas de IA

### `ai_insights` - Insights de IA

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ |

---

### `ai_actions` - Ações Automatizadas

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ |

---

### `ai_inference_metrics` - Métricas de Inferência

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

## Tabelas de Tenant e Billing

### `tenants` - Tenants

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ✅ 🔒 | ✅ 🔒 | ✅ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ✅ |
| UPDATE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ✅ |

---

### `tenant_subscriptions` - Assinaturas

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ 🌐 | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ✅ |
| UPDATE | ✅ | ❌ | ❌ | ❌ | ✅ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ |

---

### `subscription_plans` - Planos

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ | ✅ | ✅ | ✅ | ✅ |
| INSERT | ✅ | ❌ | ❌ | ❌ | ✅ |
| UPDATE | ✅ | ❌ | ❌ | ❌ | ✅ |
| DELETE | ✅ | ❌ | ❌ | ❌ | ✅ |

**Nota:** SELECT usa `USING (true)` - planos são informação pública para usuários autenticados.

---

## Tabelas de Rate Limiting e Segurança

### `rate_limits` - Rate Limiting

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ❌ | ❌ | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

### `ip_blocklist` - IPs Bloqueados

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ✅ | ✅ 🔒 | ❌ | ❌ | ✅ |

---

### `failed_login_attempts` - Tentativas de Login Falhas

| Operação | super_admin | admin | operator | viewer | service_role |
|----------|-------------|-------|----------|--------|--------------|
| SELECT | ✅ | ✅ | ❌ | ❌ | ✅ |
| INSERT | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| UPDATE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |
| DELETE | ❌ | ❌ | ❌ | ❌ | ✅ ⚙️ |

---

## Views Seguras (security_invoker=on)

Todas as views utilizam `security_invoker=on` para aplicar RLS corretamente:

| View | Descrição | Filtro |
|------|-----------|--------|
| `agents_safe` | Agents sem hmac_secret | tenant_id via user_roles |
| `agents_health_view` | Health summary | tenant_id via user_roles |
| `enrollment_keys_safe` | Keys com mascaramento | tenant_id via user_roles |
| `v_problematic_agents` | Agents com problemas | tenant_id via user_roles |
| `v_agent_lifecycle_state` | Estado do ciclo de vida | tenant_id via user_roles |
| `v_agent_health_summary` | Resumo de saúde | tenant_id via user_roles |
| `jobs_normalized` | Jobs normalizados | tenant_id via user_roles |
| `installation_metrics_summary` | Métricas de instalação | tenant_id via user_roles |

---

## Funções SECURITY DEFINER

Funções que bypassam RLS para operações internas:

| Função | Propósito | Proteção |
|--------|-----------|----------|
| `has_role(uuid, app_role)` | Check de role | Retorna apenas boolean |
| `is_super_admin(uuid)` | Check de super admin | Retorna apenas boolean |
| `current_user_tenant_id()` | Tenant do usuário atual | Retorna apenas UUID |
| `update_user_role_rpc()` | Atualização de role | Bloqueia escalação para super_admin |
| `get_enrollment_key_full()` | Recuperar key completa | Apenas service_role |

---

## Padrões de Isolamento Multi-Tenant

### Padrão 1: Via `current_user_tenant_id()`
```sql
USING (tenant_id = current_user_tenant_id())
```

### Padrão 2: Via JOIN com `user_roles`
```sql
USING (tenant_id IN (
  SELECT tenant_id FROM user_roles 
  WHERE user_id = auth.uid()
))
```

### Padrão 3: Via `has_role()` + tenant check
```sql
USING (has_role(auth.uid(), 'admin') AND tenant_id = current_user_tenant_id())
```

---

## Estatísticas de Cobertura

| Métrica | Valor |
|---------|-------|
| Tabelas com RLS | 81/81 (100%) |
| Políticas totais | 180+ |
| Views com security_invoker | 8/8 (100%) |
| SECURITY DEFINER views | 0 (migradas) |
| Tabelas sem INSERT para usuários | 35+ |
| Tabelas somente leitura para usuários | 28+ |

---

## Última Atualização

**Data:** 2025-12-11  
**Auditado por:** Sistema de Segurança CyberShield  
**Próxima Revisão:** 2026-01-11
