# Runbook: Deteccao de Bypass RLS / Vazamento Cross-Tenant

**Severidade**: Critica (P0)
**Meta MTTR**: < 15 minutos (contencao)
**Escalacao**: Imediata para CTO + CISO

---

## Sintomas

- Teste de invariantes RLS falhando (`run-rls-tests`)
- Dados de tenant A acessiveis por tenant B
- View retornando dados sem filtro de tenant
- RPC retornando dados alem do escopo do caller
- Alerta de `integrity-sentinel`
- Auditoria mostrando acesso cross-tenant

---

## Diagnostico Rapido

### 1. Verificar Politicas RLS

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = '<tabela_suspeita>'
ORDER BY tablename, policyname;
```

### 2. Verificar se RLS esta Habilitado

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = '<tabela_suspeita>';
```

### 3. Testar Isolamento

```sql
-- Como usuario do tenant A, tentar acessar dados do tenant B
SET request.jwt.claim.sub = '<user_id_tenant_a>';
SELECT * FROM <tabela>
WHERE tenant_id = '<tenant_b_id>'
LIMIT 1;
-- Resultado esperado: 0 linhas
```

### 4. Verificar Views e RPCs

```sql
-- Listar views sem referencia a tenant_id
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
  AND definition NOT LIKE '%tenant_id%';

-- Listar funcoes SECURITY DEFINER
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prosecdef = true;
```

---

## Procedimento de Contencao

### 1. Identificar Tabelas Afetadas

```sql
-- Tabelas sem RLS
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
  AND tablename NOT LIKE 'pg_%';
```

### 2. Habilitar RLS Imediatamente

```sql
-- Para cada tabela sem RLS
ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;

-- Politica restritiva padrao (bloqueia tudo ate criar politica correta)
CREATE POLICY "emergency_lockdown" ON public.<tabela>
  FOR ALL USING (false);
```

### 3. Corrigir Views Vulneraveis

Se uma view expoe dados sem filtro:
```sql
-- Dropar view vulneravel
DROP VIEW IF EXISTS public.<view_vulneravel>;

-- Recriar com filtro de tenant
CREATE VIEW public.<view_corrigida> AS
SELECT * FROM public.<tabela>
WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid());
```

### 4. Auditar Funcoes SECURITY DEFINER

```sql
-- Verificar se tem SET search_path
SELECT proname, proconfig
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND prosecdef = true
  AND (proconfig IS NULL OR NOT proconfig @> ARRAY['search_path=public']);
```

---

## Verificacao Pos-Correcao

1. Executar `run-rls-tests` e verificar 100% de sucesso
2. Testar isolamento manualmente para tabelas corrigidas
3. Verificar que nenhuma view contorna RLS
4. Verificar que todas as funcoes SECURITY DEFINER tem `SET search_path`
5. Monitorar audit_logs por 24h

---

## Prevencao

| Controle | Frequencia | Ferramenta |
|----------|-----------|------------|
| Testes de invariantes RLS | Diario (CI) | run-rls-tests |
| Scan de tabelas sem RLS | Semanal | integrity-sentinel |
| Auditoria de views | Quinzenal | Manual |
| Review de funcoes SECURITY DEFINER | Mensal | security-monitor |
| Pen test externo | Trimestral | Terceiro |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield SecOps | Versao inicial |
