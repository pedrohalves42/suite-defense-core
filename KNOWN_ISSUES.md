# ⚠️ Problemas Conhecidos - CyberShield

---

## ✅ PROBLEMAS RESOLVIDOS - Fase 1-5 (2025-11-12)

### 1. Edge Functions - Erros 500 ✅
**Status:** RESOLVIDO

**Correções aplicadas:**
- `update-user-role`: Agora aceita `userId` OU `user_id` para compatibilidade
- `auto-generate-enrollment`: Error handling já implementado com logger estruturado
- Ambas funções agora usam `logger.ts` (não console.log direto)

---

### 2. Erro 403 no PATCH /user_roles ✅
**Status:** RESOLVIDO

**Causa raiz:** Frontend tentava fazer PATCH direto na tabela `user_roles` via PostgREST, violando RLS.

**Correção aplicada:**
- Criado RPC `update_user_role_rpc` com SECURITY DEFINER
- Edge Function `update-user-role` continua sendo o proxy seguro
- Frontend agora envia headers `Authorization` explicitamente:

```typescript
const { data: { session } } = await supabase.auth.getSession();

await supabase.functions.invoke('update-user-role', {
  body: { userId, roles: [newRole] },
  headers: {
    Authorization: `Bearer ${session?.access_token}`,
  },
});
```

**Função RPC criada:**
```sql
public.update_user_role_rpc(
  p_user_id uuid, 
  p_new_role app_role
) RETURNS jsonb
```

---

### 3. Erro 400 no JOIN audit_logs + profiles ✅
**Status:** RESOLVIDO

**Causa raiz:** Faltava foreign key entre `audit_logs` e `profiles`.

**Correção aplicada:**
- Adicionada coluna `actor_id` em `audit_logs`
- Criada foreign key: `audit_logs.actor_id -> profiles.user_id`
- Queries agora usam: `profiles:profiles!audit_logs_actor_id_fkey(full_name)`

**Migration executada:**
```sql
ALTER TABLE public.audit_logs ADD COLUMN actor_id uuid;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
```

---

### 4. React Warnings - Select Uncontrolled ✅
**Status:** JÁ ESTAVA CORRETO

**Verificação:**
- `SafeSelect.tsx` já implementa controle correto de estado
- Nunca passa `value=""` vazio aos `SelectItem`
- Sempre tem fallback: `value || options[0]?.value || ''`

---

### 5. Frontend - Headers de Autenticação ✅
**Status:** RESOLVIDO

**Correções aplicadas em `Members.tsx`:**

1. **Query `list-users` agora envia token:**
```typescript
const { data: { session } } = await supabase.auth.getSession();
await supabase.functions.invoke('list-users', {
  headers: { Authorization: `Bearer ${session?.access_token}` }
});
```

2. **Mutation `update-user-role` agora envia token**

3. **Cache keys incluem `tenant.id`:**
```typescript
queryKey: ['tenant-members', tenant?.id]
```

---

### 6. Boas Práticas Implementadas ✅

**Estrutura de error handling:**
- ✅ Try/catch em todas Edge Functions
- ✅ Validação com Zod
- ✅ Status codes corretos (400, 401, 403, 500)
- ✅ Logger estruturado (`logger.ts`)

**Segurança:**
- ✅ RPC com SECURITY DEFINER para bypass controlado de RLS
- ✅ Edge Functions como proxy seguro
- ✅ Headers de autenticação explícitos
- ✅ Audit logs com `actor_id`

**Performance:**
- ✅ Cache keys corretos com `tenant.id`
- ✅ Invalidação de cache precisa

---

## TypeScript Strict Mode Ativado

**Status:** ⏳ Erros esperados - Correção gradual em andamento

**Descrição:**
Após ativar `strict: true` no TypeScript, diversos arquivos apresentam erros de tipo que estavam anteriormente ignorados. Isso é **ESPERADO** e indica que o código está sendo validado corretamente.

**Arquivos com erros de tipo conhecidos:**
- `src/pages/admin/Members.tsx`
- `src/hooks/useUserRole.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/TopBar.tsx`
- `src/pages/admin/Users.tsx`
- Diversos componentes com props opcionais não validadas

**Erros comuns:**
- `Object is possibly 'null'` ou `'undefined'`
- `Type 'X' is not assignable to type 'Y'`
- `Parameter 'x' implicitly has an 'any' type`

**Estratégia de correção:**
1. **Curto prazo:** Adicionar `// @ts-expect-error` temporário onde necessário
2. **Médio prazo:** Corrigir gradualmente durante desenvolvimento de novas features
3. **Longo prazo:** Eliminar todos os `@ts-expect-error` e ter 100% type-safe

**Como verificar erros:**
```bash
npm run type-check
```

---

## Package.json Scripts Pendentes

**Status:** 🔴 Ação manual necessária

**Descrição:**
O arquivo `package.json` é read-only no Lovable. Scripts recomendados precisam ser adicionados manualmente se necessário:

**Scripts sugeridos (adicionar manualmente se necessário):**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:report": "playwright show-report",
    
    "clean": "rimraf dist electron/dist electron/web",
    "build:web": "vite build",
    "build:electron:prep": "node electron/scripts/prepare.js",
    "build:electron": "electron-builder",
    "build:exe": "npm run clean && npm run build:web && npm run build:electron:prep && npm run build:electron",
    "validate:exe": "node electron/scripts/validate.js",
    "start:electron": "electron electron/main.js",
    
    "type-check": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,json,css,md}\""
  }
}
```

**Workaround:**
Use comandos diretos enquanto scripts não estão disponíveis:
```bash
npx vitest                    # ao invés de npm test
npx playwright test           # ao invés de npm run test:e2e
npx tsc --noEmit             # ao invés de npm run type-check
```

---

## Dependências de Desenvolvimento em dependencies

**Status:** ⏳ Pendente movimentação

**Descrição:**
As seguintes dependências estão incorretamente em `dependencies` quando deveriam estar em `devDependencies`:

- `@playwright/test`
- `@testing-library/jest-dom`
- `@testing-library/react`
- `@vitest/coverage-v8`
- `@vitest/ui`
- `electron`
- `electron-builder`
- `jsdom`
- `rimraf`
- `vitest`

**Impacto:**
- Bundle de produção ~150MB maior que necessário
- Instalação mais lenta em ambientes de produção

**Ação necessária:**
Devido às limitações do Lovable (package.json read-only), a movimentação precisa ser feita manualmente em repositório clonado.

**Como corrigir manualmente:**
```bash
# Clonar repositório
git clone <YOUR_GIT_URL>

# Editar package.json manualmente
# Mover dependências listadas acima para devDependencies

# Reinstalar
rm -rf node_modules package-lock.json
npm install

# Commit e push
git add package.json package-lock.json
git commit -m "fix: move dev dependencies to devDependencies"
git push
```

---

## Electron Auto-Update

**Status:** 🔴 Configuração pendente

**Descrição:**
A funcionalidade de auto-update do Electron está implementada mas não configurada.

**Ação necessária:**
1. Configurar `electron-builder.yml` com repositório GitHub real
2. Gerar GitHub Personal Access Token para releases
3. Adicionar secret `GH_TOKEN` nas variáveis de ambiente de CI/CD
4. Testar flow de auto-update em ambiente de produção

**Arquivo afetado:**
`electron-builder.yml` - Seção `publish` foi removida para evitar erros de build.

**Para reativar auto-update:**
```yaml
publish:
  provider: github
  owner: seu-username-github
  repo: cybershield
  releaseType: release
```

---

## Variável de Ambiente Inconsistente

**Status:** ✅ Parcialmente resolvido

**Descrição:**
Havia inconsistência entre nomes de variáveis:
- `.env` usava `VITE_SUPABASE_PUBLISHABLE_KEY`
- `.env.test` usava `VITE_SUPABASE_ANON_KEY`

**Resolução:**
Padronizado para `VITE_SUPABASE_ANON_KEY` em todos os arquivos exemplo.

**Ação necessária:**
Se você tem um `.env` local antigo, atualize o nome da variável:
```bash
# Antigo (remover)
VITE_SUPABASE_PUBLISHABLE_KEY=...

# Novo (usar)
VITE_SUPABASE_ANON_KEY=...
```

---

## ESLint: Variáveis não Utilizadas

**Status:** ✅ Resolvido

**Descrição:**
A regra `@typescript-eslint/no-unused-vars` estava desativada, permitindo código morto.

**Resolução:**
Regra reativada com exceção para variáveis começando com `_`:
```javascript
"@typescript-eslint/no-unused-vars": ["warn", {
  "argsIgnorePattern": "^_",
  "varsIgnorePattern": "^_"
}]
```

**Uso:**
```typescript
// ❌ Vai gerar warning
const unusedVar = 123;

// ✅ Não gera warning (prefixo _)
const _unusedVar = 123;

// ✅ Útil em callbacks
array.map((_item, index) => index)
```

---

## Console.log em Produção

**Status:** ⚠️ Atenção

**Descrição:**
Nova regra ESLint alerta sobre uso de `console.log` em código.

**Regra:**
```javascript
"no-console": ["warn", { allow: ["warn", "error"] }]
```

**Permitido:**
- `console.warn()`
- `console.error()`

**Não permitido (gera warning):**
- `console.log()`
- `console.info()`
- `console.debug()`

**Recomendação:**
Use o logger centralizado em Edge Functions (`supabase/functions/_shared/logger.ts`) ou remova console.log antes de produção.

---

## Performance: React Query Cache

**Status:** ✅ Otimizado

**Descrição:**
React Query estava com configuração padrão não otimizada.

**Resolução:**
Configurado em `src/main.tsx`:
- `staleTime: 5 minutos`
- `gcTime: 10 minutos`
- `refetchOnWindowFocus: false`
- `retry: 1`

**Impacto:**
- Menos requisições desnecessárias
- Melhor UX (menos loading states)
- Menor carga no backend

---

## Testes E2E: Autenticação

**Status:** ⚠️ Limitação conhecida

**Descrição:**
Testes E2E não conseguem acessar rotas protegidas por autenticação.

**Workaround:**
Use credenciais de teste em `.env.test` e implemente login programático nos testes.

**Exemplo:**
```typescript
// e2e/helpers/auth.ts
export async function login(page: Page) {
  await page.goto('/login');
  await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL!);
  await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL('/admin/dashboard');
}
```

---

## Suporte

Para reportar novos problemas:
1. Verifique se já está listado neste arquivo
2. Execute `npm run type-check` e `npm run lint` para diagnóstico
3. Consulte logs do console do navegador
4. Verifique logs das Edge Functions no backend

**Documentação relacionada:**
- [SETUP.md](SETUP.md) - Guia de setup
- [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) - Guia de troubleshooting
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Guia de testes
