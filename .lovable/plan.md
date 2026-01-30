
# Plano: Liberar Signup para Todos os IPs e Corrigir Validação

## Diagnóstico Completo

### IPs Já Estão Liberados
A tabela `admin_ip_whitelist` já contém entradas que permitem TODOS os IPs:
- `0.0.0.0/0` - Permitir todos os IPs IPv4
- `::/0` - Permitir todos os IPs IPv6

Não há IPs na blocklist (`ip_blocklist` está vazia).

### Problema Real Identificado: Validação de Nome no Frontend

O arquivo `src/pages/Signup.tsx` (linha 32) tem uma regex que **bloqueia nomes com acentos**:

```typescript
.regex(/^[a-zA-Z\s]+$/, 'Nome deve conter apenas letras e espacos')
```

Essa regex **NÃO aceita**:
- João, José, André, Antônio, Cláudia, Lucélia
- Qualquer nome com ç, ã, é, ô, etc.

O nome "ANDRE LUIZ HENRIQUE ALVES DE OLIVEIRA" da imagem **não tem acentos**, então deveria passar. Mas o erro genérico "Erro ao processar seu cadastro" pode indicar que houve falha em outra parte.

---

## Correções Necessárias

### Fase A: Corrigir Validação de Nome (P0)

**Arquivo**: `src/pages/Signup.tsx`

**Problema**: Linha 32 usa regex que rejeita acentos
**Solução**: Usar regex que aceite caracteres Unicode/acentuados

```typescript
// ANTES:
.regex(/^[a-zA-Z\s]+$/, 'Nome deve conter apenas letras e espacos')

// DEPOIS:
.regex(/^[\p{L}\s'-]+$/u, 'Nome deve conter apenas letras, espacos, hifens ou apostrofos')
```

Explicação da nova regex:
- `\p{L}` = Qualquer letra Unicode (inclui acentos)
- `\s` = Espaços
- `'-` = Hífens e apóstrofos (para nomes como "O'Brien" ou "Jean-Pierre")
- `u` flag = Habilita suporte Unicode

### Fase B: Adicionar Logging no Frontend (P1)

Para diagnosticar erros futuros, adicionar console.log detalhado no signup:

```typescript
if (error) {
  console.error('[Signup Error]', {
    message: error.message,
    status: error.status,
    code: error.code,
    details: error
  });
  // ... toast existente
}
```

### Fase C: Verificar Trigger handle_new_user (P1)

O trigger está correto, mas para garantir, adicionar log de debug:

```sql
-- No início do trigger:
RAISE LOG 'handle_new_user: Iniciando para email % (ID: %)', NEW.email, NEW.id;

-- Após cada etapa crítica:
RAISE LOG 'handle_new_user: Tenant % criado', new_tenant_id;
RAISE LOG 'handle_new_user: Features provisionadas para tenant %', new_tenant_id;
```

---

## Resumo de Entregáveis

| Prioridade | Tarefa | Tipo | Impacto |
|------------|--------|------|---------|
| **P0** | Corrigir regex de validação de nome para aceitar acentos | Frontend | Desbloqueia brasileiros |
| **P1** | Adicionar logging de erro no signup | Frontend | Melhora debug |
| **P1** | Verificar logs do Supabase Auth | Diagnóstico | Identifica erros backend |

---

## Validação Pós-Correção

1. **Teste de Signup**:
   - Tentar criar conta com nome "João da Silva" (com acento)
   - Tentar criar conta com nome "ANDRE LUIZ" (sem acento)
   - Ambos devem funcionar

2. **Verificar Criação no Banco**:
   ```sql
   SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 5;
   SELECT id, name, owner_user_id FROM tenants ORDER BY created_at DESC LIMIT 5;
   ```

3. **Console do Browser**:
   - Não deve haver erros no console após signup bem-sucedido
   - Se houver erro, o log detalhado ajudará a diagnosticar

---

## Nota sobre Rate Limiting

O sistema tem rate limiting para endpoints de agente (heartbeat, metrics), mas **não há rate limit para signup**. A tabela `rate_limits` mostra apenas registros de agentes, não de usuários tentando criar conta.

O bloqueio de IP (`ip_blocklist`) é aplicado apenas para tentativas de login falhas repetidas, não para signup.
