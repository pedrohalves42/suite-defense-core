

## Plano: Corrigir Login do genialcred@gmail.com + Status dos Agentes

### Problema 1: "Nenhuma Empresa Associada" para genialcred@gmail.com

**Causa raiz encontrada:** A funcao `get_active_tenant_id()` no banco de dados le o campo `active_tenant_id` do **nivel raiz** do JWT (`->>'active_tenant_id'`). Porem, no JWT do Supabase, campos de `app_metadata` ficam **dentro** do objeto `app_metadata`. O caminho correto seria `::json->'app_metadata'->>'active_tenant_id'`.

Isso faz com que `get_active_tenant_id()` **sempre retorne NULL** para usuarios nao-super_admin. A politica RLS da tabela `tenants` exige `id = get_active_tenant_id()` para SELECT -- como retorna NULL, o JOIN na query do hook `useActiveTenant` falha silenciosamente, o tenant volta como null, e o usuario e redirecionado para /no-tenant.

O unico usuario que funciona atualmente e `pedrohalves42@gmail.com` porque ele e `super_admin`, e a politica tem `OR is_current_super_admin()` que libera o acesso.

**Solucao:** Corrigir a funcao `get_active_tenant_id()` para ler do caminho correto no JWT E adicionar uma politica RLS de fallback na tabela `tenants` que permita SELECT quando o `user_id` tem um `user_roles` associado (para resolver o problema de "ovo e galinha" -- precisa ler o tenant para setar o active_tenant, mas precisa do active_tenant para ler o tenant).

---

### Problema 2: Agentes ainda em versoes antigas

**Status atual da frota (ambos tenants, excluindo archived):**

| Hostname | Versao | Status |
|----------|--------|--------|
| SERVIDOR | v5.0.3 | Online |
| SISTEMA | v5.0.3 | Online |
| DANI | v5.0.3 | Online |
| PRISCILA | v5.0.3 | Online |
| DESKTOP-F4LJVQE | v5.0.3 | Online |
| DESKTOP-NOHACIE | v5.0.3 | Online |
| ATENDIMENTO02 | v5.0.3 | Online |
| DESKTOP-UOABRHB | **v4.5.0** | Online |
| DESKTOP-H1GI8NB | **v5.0.2** | Online |
| DESKTOP-9E0EABD | **v5.0.2** | Online |
| DESKTOP-59Q54R2 | **v5.0.2** | Online |
| DESKTOP-IM5ALAC | **v5.0.2** | Online |
| ADM | **v5.0.1** | Online |
| ATEND_04 | **v4.1.9** | Online (1 delivery, ignorou) |

**7 de 14 agentes online estao em versao desatualizada.**

O `force_update_version` foi limpo para a maioria, entao o heartbeat nao esta enviando comando de update. Precisamos re-setar o `force_update_version = 'v5.0.3'` para todos os agentes que nao estao nessa versao.

---

### Acoes a Executar

#### 1. Migracao SQL -- Corrigir `get_active_tenant_id()`
Alterar a funcao para ler o caminho correto do JWT:
```sql
-- De:
v_claim := current_setting('request.jwt.claims', true)::json->>'active_tenant_id';
-- Para:
v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
```

#### 2. Migracao SQL -- Adicionar politica RLS de fallback na tabela `tenants`
Permitir que usuarios com `user_roles` associado possam fazer SELECT no seu proprio tenant (resolve o problema de bootstrap):
```sql
CREATE POLICY "Users can view their own tenants"
ON public.tenants FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.tenant_id = tenants.id
  )
);
```

#### 3. Migracao SQL -- Re-setar force_update para agentes desatualizados
```sql
UPDATE public.agents 
SET force_update_version = 'v5.0.3', force_update_delivered_count = 0
WHERE agent_version != 'v5.0.3' AND status = 'active';
```

#### 4. Nenhuma alteracao de codigo frontend necessaria
O hook `useActiveTenant` e o `ProtectedRoute` ja estao corretos -- o problema e exclusivamente nas politicas RLS do banco.

---

### Resultado Esperado

- **genialcred@gmail.com** conseguira logar e ver o dashboard da Genial Cred normalmente
- **Qualquer usuario admin** (nao apenas super_admin) podera acessar o sistema
- **Agentes desatualizados** receberao novamente o comando de force_update no proximo heartbeat

