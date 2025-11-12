# Warnings de Segurança do Supabase

## Status Atual: 3 Warnings Pendentes

### ⚠️ WARN 1: Extension in Public

**Severidade:** WARN  
**Categoria:** SECURITY

**Descrição:**  
Extensões PostgreSQL detectadas instaladas no schema `public`.

**Impacto:**  
Extensões no schema público podem expor funcionalidades não desejadas através da API REST do Supabase.

**Como Corrigir:**
1. Identificar extensões no schema `public`:
   ```sql
   SELECT e.extname, n.nspname 
   FROM pg_extension e 
   JOIN pg_namespace n ON e.extnamespace = n.oid 
   WHERE n.nspname = 'public';
   ```

2. Mover extensões para o schema `extensions`:
   ```sql
   -- Exemplo para mover uma extensão
   DROP EXTENSION IF EXISTS <extension_name> CASCADE;
   CREATE SCHEMA IF NOT EXISTS extensions;
   CREATE EXTENSION <extension_name> SCHEMA extensions;
   ```

**Referência:** https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

---

### ⚠️ WARN 2: Materialized View in API

**Severidade:** WARN  
**Categoria:** SECURITY

**Descrição:**  
Materialized views detectadas que estão acessíveis através das Data APIs.

**Impacto:**  
Views materializadas expostas publicamente podem vazar dados sensíveis ou permitir acesso não intencional.

**Como Corrigir:**
1. Identificar materialized views expostas:
   ```sql
   SELECT schemaname, matviewname 
   FROM pg_matviews 
   WHERE schemaname = 'public';
   ```

2. Aplicar RLS ou remover da API:
   ```sql
   -- Opção 1: Aplicar RLS
   ALTER MATERIALIZED VIEW <view_name> ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY "view_policy_name"
   ON <view_name>
   FOR SELECT
   USING (auth.uid() IS NOT NULL);
   
   -- Opção 2: Mover para schema privado
   ALTER MATERIALIZED VIEW <view_name> 
   SET SCHEMA private;
   ```

**Referência:** https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api

---

### ⚠️ WARN 3: Leaked Password Protection Disabled

**Severidade:** WARN  
**Categoria:** SECURITY

**Descrição:**  
A proteção contra senhas vazadas está desativada no Supabase Auth.

**Impacto:**  
Usuários podem criar contas com senhas que foram comprometidas em vazamentos públicos, aumentando significativamente o risco de ataques de credential stuffing.

**Como Corrigir:**
1. Acessar Supabase Dashboard → Authentication → Password Settings
2. Ativar "Leaked Password Protection"
3. Configurar requisitos mínimos de senha:
   - Mínimo 8 caracteres
   - Letras maiúsculas e minúsculas
   - Números
   - Símbolos especiais

**Configuração Recomendada:**
```json
{
  "password_min_length": 8,
  "password_strength": "strong",
  "leaked_password_protection": true
}
```

**Ação Adicional (Opcional):**
Forçar reset de senhas fracas existentes:
```sql
-- Identificar usuários com senhas potencialmente fracas
SELECT id, email, created_at 
FROM auth.users 
WHERE created_at < NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Enviar email de reset via função
SELECT auth.admin_send_password_reset_email('<user_email>');
```

**Referência:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

---

## Prioridade de Correção

1. **Alta Prioridade:** Leaked Password Protection (WARN 3)
   - **Tempo estimado:** 5 minutos
   - **Impacto:** Crítico para segurança de contas de usuário

2. **Média Prioridade:** Materialized View in API (WARN 2)
   - **Tempo estimado:** 15-30 minutos
   - **Impacto:** Possível vazamento de dados

3. **Baixa Prioridade:** Extension in Public (WARN 1)
   - **Tempo estimado:** 10-15 minutos
   - **Impacto:** Exposição de funcionalidades não desejadas

## Plano de Ação

### Fase 1: Correção Imediata (30 minutos)
1. Ativar Leaked Password Protection
2. Identificar e catalogar materialized views
3. Identificar extensões no schema public

### Fase 2: Implementação (1-2 horas)
1. Aplicar RLS em materialized views
2. Mover extensões para schema apropriado
3. Testar acesso após correções

### Fase 3: Validação (30 minutos)
1. Re-executar Supabase Linter
2. Verificar 0 warnings
3. Testar funcionalidades afetadas

---

**Última atualização:** 2025-01-11  
**Próxima revisão:** Após implementação das correções
