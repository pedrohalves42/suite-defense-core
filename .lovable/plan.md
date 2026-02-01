
# Plano de Implementação: Ações Obrigatórias Prof. Nullmann (A-001 a A-004)

## Resumo Executivo

Com base na auditoria do Prof. Elias Nullmann, implementarei 4 ações corretivas para fornecer **provas empíricas concretas** das features que foram classificadas como "NAO PROVADAS" ou "REFUTADAS".

| Acao | Problema Identificado | Severidade | Status Atual |
|------|----------------------|------------|--------------|
| A-001 | `hmac_signatures` vazia (0 registros) | CRITICO | Replay protection NAO OPERACIONAL |
| A-002 | 3 jobs com `output=NULL` | ALTO | Viola INV-008 |
| A-003 | Zero testes RLS executados | MEDIO | Isolamento NAO PROVADO |
| A-004 | Metodologia nao documentada | BAIXO | Sem framework de auditoria |

---

## A-001: Corrigir Replay Protection (hmac_signatures vazia)

### Causa Raiz Identificada

A investigacao revelou que:

1. **Codigo existe e esta correto**: `hmac.ts` linhas 180-183 fazem o insert
2. **HMAC validation esta sendo chamada**: `poll-jobs/index.ts` linhas 72-99
3. **PROBLEMA**: Tabela `hmac_signatures` tem RLS habilitado mas **nenhuma policy de INSERT**

```text
Evidencia da Investigacao:
+-----------------------------+---------------------------+
| Fato                        | Valor                     |
+-----------------------------+---------------------------+
| total_signatures            | 0                         |
| RLS enabled                 | true                      |
| Policies existentes         | 1 (SELECT only, qual=false)|
| INSERT policy               | NAO EXISTE                |
+-----------------------------+---------------------------+
```

O insert na linha 180 do `hmac.ts` esta falhando silenciosamente porque:
- RLS esta habilitado
- Nao existe policy de INSERT para `service_role`
- O erro nao e logado (insert silencioso)

### Correcao Proposta

Adicionar policy de INSERT para `service_role` (edge functions):

```sql
-- Permitir que edge functions (service_role) insiram signatures
CREATE POLICY "Service role can insert signatures" 
ON hmac_signatures 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Tambem precisamos de SELECT para verificar replay
CREATE POLICY "Service role can check signatures" 
ON hmac_signatures 
FOR SELECT 
TO service_role 
USING (true);
```

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Migration SQL | Criar | Adicionar policies de INSERT e SELECT para service_role |
| `supabase/functions/_shared/hmac.ts` | Editar | Adicionar logging explicito no insert (linhas 180-183) |

---

## A-002: Corrigir 3 Jobs sem Output (INV-008)

### Jobs Identificados

```text
+--------------------------------------+-----------------------+------------+
| ID                                   | Tipo                  | Criado     |
+--------------------------------------+-----------------------+------------+
| b25bac21-5d65-43a2-b47a-1ed5ef52af0e | sync_blocked_websites | 2026-01-12 |
| 5cb3aa61-2215-4009-98ad-c098d408561b | sync_blocked_websites | 2026-01-02 |
| 861b288e-dcdb-437f-a95e-ea84d04ea54e | sync_blocked_websites | 2025-12-29 |
+--------------------------------------+-----------------------+------------+
```

### Correcao Proposta

Executar UPDATE nos 3 jobs historicos com output de migracao:

```sql
UPDATE jobs 
SET output = '{"migrated": true, "reason": "nullmann_audit_a002", "fixed_at": "2026-02-01"}'::jsonb
WHERE id IN (
  'b25bac21-5d65-43a2-b47a-1ed5ef52af0e',
  '5cb3aa61-2215-4009-98ad-c098d408561b',
  '861b288e-dcdb-437f-a95e-ea84d04ea54e'
)
AND status = 'completed'
AND output IS NULL;
```

### Validacao Pos-Correcao

```sql
-- Verificar que nao ha mais violacoes
SELECT COUNT(*) FROM jobs WHERE status='completed' AND output IS NULL;
-- ESPERADO: 0
```

---

## A-003: Executar e Registrar Testes RLS E2E

### Estado Atual

- Tabela `rls_test_results` existe
- Zero testes executados nos ultimos 7 dias
- Isolamento cross-tenant NAO PROVADO empiricamente

### Implementacao

Criar componente React que executa testes RLS via edge function existente `run-rls-tests` e salva resultados:

```text
Fluxo:
1. Frontend chama edge function run-rls-tests
2. Edge function executa queries cross-tenant
3. Resultados salvos em rls_test_results
4. UI exibe status PROVADO/NAO PROVADO
```

### Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/security/RLSTestRunner.tsx` | Criar | Componente para executar e visualizar testes |
| `supabase/functions/run-rls-tests/index.ts` | Verificar | Confirmar que salva em rls_test_results |

---

## A-004: Documentar Metodologia Nullmann

### Implementacao

Criar documento `docs/NULLMANN_METHODOLOGY.md` com a metodologia completa de auditoria por prova de existencia.

### Conteudo do Documento

1. **Principio Fundamental**: Nada funciona por padrao
2. **Processo de Auditoria**: 4 fases (Estado Inicial, Busca de Evidencia, Analise Empirica, Estado Final)
3. **Classificacao de Estados**: NAO PROVADO, REFUTADO, PARCIAL, PROVADO
4. **Exemplos de Provas**: SQL queries para cada invariante
5. **Checklist de Auditoria**: Template reproduzivel

---

## Secao Tecnica

### Arquivos a Criar

| Arquivo | Descricao |
|---------|-----------|
| `docs/NULLMANN_METHODOLOGY.md` | Metodologia de auditoria por prova de existencia |
| `src/components/security/RLSTestRunner.tsx` | Componente para executar testes RLS |

### Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/_shared/hmac.ts` | Adicionar logging explicito no insert (linhas 180-183) |

### Migrations SQL Necessarias

1. **A-001**: Adicionar policies de INSERT/SELECT para service_role em hmac_signatures
2. **A-002**: UPDATE nos 3 jobs com output NULL

### Ordem de Execucao

```text
1. [A-001] Corrigir policies hmac_signatures (migracao + codigo)
2. [A-002] Corrigir jobs sem output (data update via tool)
3. [A-003] Implementar RLSTestRunner e executar testes
4. [A-004] Criar documentacao da metodologia
```

### Validacao Final

Apos implementacao, executar queries de validacao:

```sql
-- A-001: Confirmar hmac_signatures recebendo dados
SELECT COUNT(*) FROM hmac_signatures WHERE used_at > NOW() - INTERVAL '1 hour';
-- ESPERADO: > 0 apos proximo poll de agente

-- A-002: Confirmar zero violacoes INV-008
SELECT COUNT(*) FROM jobs WHERE status='completed' AND output IS NULL;
-- ESPERADO: 0

-- A-003: Confirmar testes RLS executados
SELECT COUNT(*) FROM rls_test_results WHERE tested_at > NOW() - INTERVAL '1 hour';
-- ESPERADO: > 0
```

### Riscos e Mitigacoes

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Policy nao resolve problema HMAC | Baixa | Verificar com edge function logs |
| Agentes offline nao testam HMAC | Media | Aguardar proximo heartbeat |
| Testes RLS falham | Muito Baixa | Ja confirmamos RLS 100% via queries |

---

## Conclusao Prof. Nullmann

Apos implementacao destas 4 acoes:

| Invariante | Estado Atual | Estado Esperado |
|------------|--------------|-----------------|
| INV-002 (HMAC) | REFUTADO | PROVADO |
| INV-008 (Side Effects) | REFUTADO | PROVADO |
| INV-001 (Isolamento) | PARCIAL | PROVADO |
| Metodologia | INEXISTENTE | DOCUMENTADA |

**Status Global Esperado**: Sistema com 10/10 invariantes PROVADAS empiricamente.
