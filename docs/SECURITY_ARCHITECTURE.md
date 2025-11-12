# Arquitetura de Segurança - CyberShield

## 🛡️ Princípios de Segurança

### 1. **Never Trust the Frontend**
- Todas as operações sensíveis passam por Edge Functions autenticadas
- RLS (Row Level Security) sempre habilitado em tabelas críticas
- Validação de entrada em múltiplas camadas (frontend + backend + database)

### 2. **Elevação de Privilégios Controlada**
- `SERVICE_ROLE_KEY` usado **apenas** em Edge Functions, nunca exposto ao cliente
- RPCs `SECURITY DEFINER` com validações rigorosas para operações privilegiadas
- Auditoria completa de todas as ações com elevação de privilégios

### 3. **Defesa em Profundidade**
- Rate limiting por tenant e endpoint
- Validação com Zod schemas
- Logs estruturados com `requestId` para rastreabilidade
- HMAC signatures para comunicação agent ↔ backend

### 4. **Principle of Least Privilege**
- Cada role tem apenas as permissões necessárias (admin, operator, viewer)
- Políticas RLS específicas por recurso
- Prevenção de auto-elevação de privilégios

---

## 🔄 Fluxo de Atualização de Roles

### Diagrama do Fluxo

```
┌─────────────────────┐
│ Frontend            │
│ (Members.tsx)       │
└──────────┬──────────┘
           │ POST /functions/v1/update-user-role
           │ Headers: Authorization + apikey
           │ Body: { userId, roles: ['viewer'] }
           ▼
┌─────────────────────┐
│ Edge Function       │
│ update-user-role    │
│                     │
│ 1. Auth JWT         │
│ 2. Check admin?     │
│ 3. Rate limit       │
│ 4. Validate input   │
└──────────┬──────────┘
           │ RPC call: update_user_role_rpc
           ▼
┌─────────────────────┐
│ Database RPC        │
│ (SECURITY DEFINER)  │
│                     │
│ 1. Verify tenant    │
│ 2. No self-change   │
│ 3. Protect last     │
│    admin            │
│ 4. UPDATE role      │
│ 5. INSERT audit_log │
└─────────────────────┘
```

### Validações por Camada

| Camada | Validações |
|--------|-----------|
| **Frontend** | UI feedback, disable own role change, client-side validation |
| **Edge Function** | JWT authentication, admin role check, rate limiting (10 req/min), Zod schema validation |
| **RPC** | Tenant matching, prevent self-role change, last admin protection, transactional integrity |

---

## 🗄️ Tabelas Sensíveis

### Matriz de Acesso

| Tabela | Frontend Direto | Edge Functions | RPCs | Observações |
|--------|----------------|----------------|------|-------------|
| `user_roles` | ❌ Nunca | ✅ Via `SERVICE_ROLE_KEY` | ✅ Via `update_user_role_rpc` | **CRÍTICO:** Nunca expor ao cliente |
| `audit_logs` | 📖 Read-only via RLS | ✅ INSERT via Edge Functions | ✅ Via RPCs | Logs imutáveis, RLS para leitura |
| `agents` | 📖 Read-only via RLS | ✅ Gerenciamento completo | ✅ Via RPCs | RLS por tenant |
| `enrollment_keys` | 📖 View masked only | ✅ Gerenciamento completo | ❌ | Keys nunca expostas em texto |
| `api_keys` | ❌ Nunca | ✅ Hash only | ❌ | Apenas hash armazenado |

---

## 🔐 Políticas RLS Principais

### user_roles

```sql
-- Usuários podem ver seus próprios roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());

-- Admins podem ver todos os roles do tenant
CREATE POLICY "Admins can view all roles in their tenant"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND 
  tenant_id = current_user_tenant_id()
);

-- Modificações APENAS via RPCs/Edge Functions
-- Sem políticas INSERT/UPDATE/DELETE públicas
```

### audit_logs

```sql
-- Admins podem ler logs do tenant
CREATE POLICY "Admins can read audit logs in their tenant"
ON public.audit_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND 
  tenant_id = current_user_tenant_id()
);

-- Inserções APENAS via Edge Functions (SERVICE_ROLE_KEY)
-- Sem políticas INSERT públicas
```

---

## 🧪 Testes de Segurança

### E2E Tests

O arquivo `e2e/update-user-role.spec.ts` valida:

1. ✅ Admin atualiza role de outro usuário
2. ❌ Admin tenta atualizar próprio role (deve falhar)
3. ❌ Non-admin tenta atualizar roles (403)
4. ❌ Tentar remover último admin (deve falhar)
5. ✅ Audit log criado corretamente
6. ❌ Rate limiting após 10 requests
7. ❌ User ID inválido retorna 404

### Manual Testing Checklist

- [ ] Verificar que `SERVICE_ROLE_KEY` não está em código frontend
- [ ] Testar login com credenciais inválidas (max 3 tentativas)
- [ ] Verificar que tokens expiram após 1h
- [ ] Testar rate limiting em endpoints sensíveis
- [ ] Validar que RLS bloqueia acessos cross-tenant
- [ ] Verificar logs estruturados em todos os Edge Functions

---

## 📊 Monitoramento e Observabilidade

### Logs Estruturados

Todos os Edge Functions usam `logger.ts`:

```typescript
logger.info('[requestId] Action description', { context });
logger.warn('[requestId] Potential issue', { details });
logger.error('[requestId] Error occurred', error);
```

### Métricas Críticas

- **Taxa de erros 401/403:** Deve ser < 5% (autenticação/autorização)
- **Taxa de erros 500:** Deve ser < 0.1% (falhas internas)
- **Latência p95:** < 150ms para Edge Functions
- **Rate limit hits:** Monitorar para detectar abuse

### Alertas

| Evento | Gravidade | Ação |
|--------|-----------|------|
| >10 failed logins (mesmo IP) | 🔴 High | Auto-block IP |
| Last admin demotion attempt | 🟡 Medium | Audit log |
| SERVICE_ROLE_KEY leak detected | 🔴 Critical | Rotate immediately |
| Unusual rate limit hits | 🟡 Medium | Investigate |

---

## 🚀 Roadmap de Segurança

### Fase 7 (Próxima)
- [ ] Implementar MFA (Multi-Factor Authentication)
- [ ] Adicionar IP whitelist para admins
- [ ] Criar dashboard de segurança em tempo real
- [ ] Implementar session recording para auditorias

### Fase 8
- [ ] Penetration testing externo
- [ ] Compliance audit (SOC 2, ISO 27001)
- [ ] Backup encryption at rest
- [ ] Zero-knowledge architecture para dados sensíveis

---

## 📚 Referências

- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- Documentação interna: `docs/RLS_BEST_PRACTICES.md`

---

**Última atualização:** 2025-01-12  
**Versão:** 1.0  
**Autor:** Lívia Integrada
