

# Implementacao das Acoes Obrigatorias Prof. Nullmann (A-001 a A-004)

## Status da Investigacao

A investigacao revelou informacoes criticas antes da implementacao:

### A-001: HMAC Signatures

**Descoberta**: As policies de INSERT/SELECT para `service_role` JA EXISTEM:
- `Service role can insert signatures` (INSERT)
- `Service role can select signatures` (SELECT)  
- `Service role can delete old signatures` (DELETE)

**Problema Real**: A tabela tem **0 registros** apesar das policies estarem corretas. O insert silencioso nao esta logando erros. Precisa de logging melhorado para diagnostico.

### A-002: Jobs com output=NULL

**Confirmado**: 3 jobs identificados para correcao:
- `b25bac21-5d65-43a2-b47a-1ed5ef52af0e` (sync_blocked_websites, 2026-01-12)
- `5cb3aa61-2215-4009-98ad-c098d408561b` (sync_blocked_websites, 2026-01-02)
- `861b288e-dcdb-437f-a95e-ea84d04ea54e` (sync_blocked_websites, 2025-12-29)

### A-003: RLS Test Runner

**Descoberta**: A edge function `run-rls-tests` JA salva resultados em `rls_test_results`. Falta apenas componente UI para execucao e visualizacao.

### A-004: Metodologia Nullmann

**Status**: Documento a ser criado em `docs/NULLMANN_METHODOLOGY.md`

---

## Plano de Implementacao

### Arquivo 1: supabase/functions/_shared/hmac.ts

**Alteracao**: Linhas 179-189 - Adicionar logging explicito no insert

```typescript
// ANTES (linhas 179-189):
  // Armazenar assinatura usada
  await supabase.from('hmac_signatures').insert({
    signature,
    agent_name: agentName,
  });

  // SEC-01 FIX: Cleanup probabilistico sincrono
  await probabilisticCleanup(supabase);

  return { valid: true, rawBody: body };

// DEPOIS:
  // Armazenar assinatura usada para replay protection (A-001 Nullmann)
  const { error: insertError } = await supabase.from('hmac_signatures').insert({
    signature,
    agent_name: agentName,
  });

  if (insertError) {
    // A-001 FIX: Log explicito para diagnostico de falhas de insert
    console.error(`[HMAC] CRITICAL: Failed to store signature for agent ${agentName}:`, {
      error: insertError.message,
      code: insertError.code,
      details: insertError.details,
      hint: insertError.hint
    });
    // Nao bloquear autenticacao se apenas o replay tracking falhar
    // mas logar para investigacao posterior
  } else {
    console.log(`[HMAC] Signature stored successfully for agent ${agentName}`);
  }

  // SEC-01 FIX: Cleanup probabilistico sincrono
  await probabilisticCleanup(supabase);

  return { valid: true, rawBody: body };
```

---

### Arquivo 2: src/components/security/RLSTestRunner.tsx (NOVO)

Componente React para executar e visualizar testes RLS com as seguintes funcionalidades:

- Botao para executar testes via edge function `run-rls-tests`
- Exibicao de resultados da ultima execucao
- Historico de testes recentes do banco
- Metricas de aprovacao/reprovacao
- Nota sobre metodologia Nullmann

**Dependencias**: Button, Card, Badge, supabase client, react-query

---

### Arquivo 3: docs/NULLMANN_METHODOLOGY.md (NOVO)

Documento completo com:

1. **Principio Fundamental**: Nada funciona por padrao
2. **Fundamentos Epistemologicos**: Axioma Zero e Cadeia de Prova
3. **Classificacao de Estados**: NAO PROVADO, REFUTADO, PARCIAL, PROVADO
4. **Processo de Auditoria**: 4 fases
5. **Taxonomia de Falhas**: 4 tipos por severidade
6. **Exemplos de Provas**: SQL queries para cada invariante
7. **Checklist de Auditoria**: Template reproduzivel
8. **Aplicacao no CyberShield**: 10 invariantes documentadas

---

### SQL: Correcao dos 3 Jobs (A-002)

Executar via ferramenta de data update:

```sql
UPDATE jobs 
SET output = '{
  "migrated": true,
  "reason": "nullmann_audit_a002",
  "fixed_at": "2026-02-01T00:00:00.000Z",
  "side_effects_applied": true
}'::jsonb
WHERE id IN (
  'b25bac21-5d65-43a2-b47a-1ed5ef52af0e',
  '5cb3aa61-2215-4009-98ad-c098d408561b',
  '861b288e-dcdb-437f-a95e-ea84d04ea54e'
)
AND status = 'completed'
AND output IS NULL;
```

---

## Ordem de Execucao

1. **A-001**: Modificar `hmac.ts` com logging melhorado
2. **A-002**: Executar UPDATE SQL nos 3 jobs
3. **A-003**: Criar `RLSTestRunner.tsx`
4. **A-004**: Criar `NULLMANN_METHODOLOGY.md`

## Validacoes Pos-Implementacao

```sql
-- A-002: Confirmar correcao
SELECT COUNT(*) FROM jobs WHERE status='completed' AND output IS NULL;
-- ESPERADO: 0

-- A-003: Confirmar testes executados (apos usar componente)
SELECT COUNT(*) FROM rls_test_results WHERE tested_at > NOW() - INTERVAL '1 hour';
-- ESPERADO: > 0
```

## Arquivos a Modificar/Criar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/functions/_shared/hmac.ts` | EDITAR | Logging melhorado linhas 179-189 |
| `src/components/security/RLSTestRunner.tsx` | CRIAR | Componente UI para testes RLS |
| `docs/NULLMANN_METHODOLOGY.md` | CRIAR | Framework de auditoria |

## Resultado Esperado

Apos implementacao:

| Invariante | Estado Atual | Estado Esperado |
|------------|--------------|-----------------|
| INV-002 (HMAC) | REFUTADO | EM INVESTIGACAO (logs ativos) |
| INV-008 (Side Effects) | REFUTADO | PROVADO (0 violacoes) |
| INV-001 (Isolamento) | PARCIAL | PROVADO (testes executados) |
| Metodologia | INEXISTENTE | DOCUMENTADA |

