# CyberShield Security Documentation

> **Versão**: 1.0.0  
> **Data**: 2025-12-30  
> **Status**: Approved  
> **Classificação**: Interno / Due Diligence

---

## Visão Geral

Este documento consolida as decisões críticas de segurança do CyberShield, servindo como ponto de entrada para desenvolvedores e referência para auditorias.

### Princípios Fundamentais

| Princípio | Descrição |
|-----------|-----------|
| **Zero Trust** | Nenhuma requisição é confiável por padrão |
| **Defense in Depth** | Múltiplas camadas de validação |
| **Fail-Closed** | Em caso de erro, negar acesso |
| **Least Privilege** | Acesso mínimo necessário |

### Pilares de Segurança

1. **Isolamento Multi-Tenant**: RLS obrigatório, `current_user_tenant_id()` em todas as queries
2. **Autenticação HMAC**: Agentes autenticam via HMAC-SHA256
3. **Auditoria Imutável**: Todas as ações críticas são registradas

---

## Políticas de Secrets e Credenciais

### 1. Enrollment Keys (SEC-001)

**Status**: ✅ RESOLVED (2025-12-30)

**Decisão**: Enrollment keys são secrets one-time. **Apenas hashes são armazenados. Plaintext nunca é persistido ou logado.**

#### Implementação

| Função | Comportamento |
|--------|---------------|
| `generate-enrollment-key` | Gera key → calcula SHA-256 → armazena apenas `key_hash` |
| `enroll-agent` | Recebe key plaintext → recalcula hash → compara com `key_hash` |
| Audit logs | **Nunca** registram a key plaintext |

#### Código de Referência

```typescript
// generate-enrollment-key/index.ts
const keyHashBuffer = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(enrollmentKey)
);
const keyHash = Array.from(new Uint8Array(keyHashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');

// Armazena apenas hash
await supabase.from('enrollment_keys').insert({
  key_hash: keyHash,  // ✅ Apenas hash
  // key: enrollmentKey  // ❌ NUNCA
});
```

#### Justificativa

- Mesmo com acesso ao banco, atacante não pode usar keys antigas
- Consistente com padrão de tokens de API
- Compliance: OWASP ASVS 2.10 (Secrets Management)

#### Validação

```sql
-- Deve retornar 0
SELECT COUNT(*) FROM enrollment_keys WHERE key IS NOT NULL;

-- Todas as novas keys devem ter hash
SELECT id, key_hash IS NOT NULL as has_hash 
FROM enrollment_keys 
ORDER BY created_at DESC LIMIT 5;
```

---

### 2. Agent Tokens

**Política**: Apenas `token_hash` armazenado na tabela `agent_tokens`.

| Campo | Armazenado | Exposto |
|-------|------------|---------|
| `token_hash` | ✅ SHA-256 | Nunca |
| `token_prefix` | ✅ Primeiros 8 chars | UI (identificação) |
| Token plaintext | ❌ Nunca | Apenas no enrollment (one-time) |

---

### 3. HMAC Secrets

**Política**: Secrets de autenticação HMAC para agentes.

- **Geração**: `crypto.randomUUID()` + processamento seguro
- **Armazenamento**: Campo `hmac_secret` na tabela `agents`
- **Exposição**: Nunca em views, logs ou respostas de API
- **Rotação**: Grace period de 24h para transição

#### Views Seguras

```sql
-- agents_safe view NUNCA expõe hmac_secret
CREATE VIEW agents_safe AS
SELECT id, agent_name, status, tenant_id, ...
-- hmac_secret EXCLUÍDO
FROM agents;
```

---

### 4. API Keys Externas

**Política**: Chaves de integração com serviços externos.

- Armazenadas apenas como hash quando possível
- Exibição mascarada no frontend (`****...last4`)
- Secrets armazenados em Supabase Vault ou env vars

---

## Decisões de Arquitetura (ADRs)

### ADR-001: RLS Obrigatório

**Decisão**: Todas as tabelas com dados de tenant têm RLS habilitado.

```sql
-- Padrão obrigatório
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.table_name
  USING (tenant_id = current_user_tenant_id());
```

**Consequência**: Queries sem tenant context retornam vazio (fail-closed).

---

### ADR-002: Autenticação HMAC para Agentes

**Decisão**: Agentes não usam JWT. Autenticam via HMAC-SHA256.

**Payload**: `timestamp:nonce:body`

**Validação**:
- Timestamp dentro de ±5 minutos
- Nonce único (anti-replay via `hmac_signatures`)
- Signature match

**Referência**: `docs/HMAC_SPECIFICATION.md`

---

### ADR-003: Fail-Closed em Falhas

**Decisão**: Qualquer falha de segurança resulta em negação de acesso.

| Situação | Resultado |
|----------|-----------|
| Erro de validação | ❌ Deny |
| Timeout | ❌ Deny |
| Circuit breaker aberto | ❌ Deny |
| Exceção não tratada | ❌ Deny |

**Nunca**: Fallback para acesso permissivo.

---

### ADR-004: Estado de Jobs Determinístico

**Decisão**: Jobs seguem state machine formal com transições validadas.

```
pending → running → completed
                 → failed
                 → cancelled
```

**Implementação**: Trigger de banco valida transições. Estados terminais são imutáveis.

---

### ADR-005: Roles em Tabela Separada

**Decisão**: Roles de usuário NUNCA são armazenados na tabela `profiles`.

**Justificativa**: Previne privilege escalation via update do próprio perfil.

**Implementação**:
```sql
-- Tabela separada com RLS restritivo
CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users,
  role app_role NOT NULL
);

-- Função SECURITY DEFINER para verificação
CREATE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
SECURITY DEFINER  -- Bypassa RLS, evita recursão
```

---

## Invariantes de Segurança

| ID | Invariante | Verificação |
|----|------------|-------------|
| INV-001 | Cross-tenant isolation | RLS em todas as tabelas |
| INV-002 | HMAC authentication | Todas as requests de agentes |
| INV-003 | Secrets nunca em logs | Grep em audit_logs |
| INV-004 | No plaintext keys | Query de validação |
| INV-005 | Audit trail completo | Todas as ações críticas logadas |

---

## Developer Security Checklist

Antes de fazer merge:

- [ ] Edge Functions validam JWT ou HMAC?
- [ ] Queries filtram por `tenant_id`?
- [ ] Secrets não são logados?
- [ ] Erros não expõem dados internos?
- [ ] RLS habilitado em novas tabelas?
- [ ] Novas roles seguem padrão `user_roles`?
- [ ] Inputs validados com Zod?

---

## Referências

| Documento | Descrição |
|-----------|-----------|
| `SECURITY_ARCHITECTURE.md` | Arquitetura completa de segurança |
| `SECURITY_INVARIANTS.md` | Invariantes formais e testes |
| `SECURITY_INVARIANTS_CHANGELOG.md` | Histórico de mudanças |
| `HMAC_SPECIFICATION.md` | Especificação HMAC detalhada |
| `security-isolation-audit.md` | Testes de isolamento multi-tenant |
| `policies/` | Políticas formais (ISO 27001) |

---

## Changelog

| Data | Versão | Mudança |
|------|--------|---------|
| 2025-12-30 | 1.0.0 | Documento inicial. SEC-001 (enrollment keys hash-only) documentado. |

---

## Contatos de Segurança

- **Reporte de vulnerabilidades**: gamehousetecnologia@gmail.com
- **Emergências**: (34) 98443-2835

---

*Este documento é parte do programa de segurança do CyberShield e deve ser atualizado a cada mudança significativa de arquitetura de segurança.*
