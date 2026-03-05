# 🧪 Metodologia Nullmann — Auditoria por Prova de Existência

> *"Sem evidência empírica, considero inexistente."*  
> — Prof. Elias Nullmann, Chief Skeptic Architect

---

## 1. Princípio Fundamental

**Nada funciona por padrão.** Toda feature, invariante ou garantia de segurança é considerada **INEXISTENTE** até que evidência concreta prove o contrário.

### Axioma Zero
```
ESTADO_INICIAL(feature) = NÃO_PROVADO
```

Código existente, documentação, e até testes unitários **não constituem prova**. Apenas dados reais em produção, logs de execução verificáveis, e testes E2E reproduzíveis são aceitos como evidência.

---

## 2. Fundamentos Epistemológicos

### 2.1 Cadeia de Prova

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   AFIRMAÇÃO     │ ──▶ │   EVIDÊNCIA     │ ──▶ │   VERIFICAÇÃO   │
│  "Feature X     │     │  - Query SQL    │     │  - Dados reais  │
│   funciona"     │     │  - Logs         │     │  - Reproduzível │
└─────────────────┘     │  - Testes E2E   │     │  - Auditável    │
                        └─────────────────┘     └─────────────────┘
```

### 2.2 Hierarquia de Evidência

| Nível | Tipo de Evidência | Peso |
|-------|-------------------|------|
| 1 | Dados em produção (queries) | ⭐⭐⭐⭐⭐ |
| 2 | Logs de execução real | ⭐⭐⭐⭐ |
| 3 | Testes E2E reproduzíveis | ⭐⭐⭐ |
| 4 | Testes unitários | ⭐⭐ |
| 5 | Código existente | ⭐ |
| 6 | Documentação | ❌ |

---

## 3. Classificação de Estados

### 3.1 Estados Possíveis

| Estado | Símbolo | Descrição | Critério |
|--------|---------|-----------|----------|
| **PROVADO** | 🟢 | Evidência irrefutável | Dados reais + testes reproduzíveis |
| **PARCIAL** | 🟡 | Evidência insuficiente | Código existe, execução não confirmada |
| **REFUTADO** | 🔴 | Evidência contrária | Dados mostram falha ou ausência |
| **NÃO PROVADO** | ⚪ | Estado inicial | Sem evidência coletada |

### 3.2 Transições de Estado

```
                    ┌──────────────┐
                    │  NÃO PROVADO │ (estado inicial)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ REFUTADO │ │ PARCIAL  │ │ PROVADO  │
        └──────────┘ └────┬─────┘ └──────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
              ┌──────────┐ ┌──────────┐
              │ REFUTADO │ │ PROVADO  │
              └──────────┘ └──────────┘
```

---

## 4. Processo de Auditoria

### Fase 1: Inventário
Listar todas as afirmações de segurança/funcionalidade do sistema.

```sql
-- Exemplo: Inventário de invariantes
SELECT 'INV-001' as id, 'Isolamento cross-tenant via RLS' as descricao
UNION ALL
SELECT 'INV-002', 'HMAC obrigatório em endpoints'
UNION ALL
SELECT 'INV-003', 'Secrets nunca expostos em views';
```

### Fase 2: Busca de Evidência
Para cada invariante, executar queries que provem ou refutem.

### Fase 3: Análise Empírica
- **Dados > Código > Documentação**
- Contradições invalidam afirmações imediatamente
- Ausência de dados = REFUTADO (não "em progresso")

### Fase 4: Classificação Final
Determinar estado final com base em evidência coletada.

---

## 5. Taxonomia de Falhas

### 5.1 Tipos de Falha por Severidade

| Tipo | Severidade | Exemplo | Impacto |
|------|------------|---------|---------|
| **P0** | CRÍTICO | RLS desabilitado | Vazamento de dados |
| **P1** | ALTO | HMAC não validado | Replay attacks possíveis |
| **P2** | MÉDIO | Logs ausentes | Auditoria comprometida |
| **P3** | BAIXO | Cleanup não executado | Performance degradada |

### 5.2 Matriz de Decisão

```
                    EVIDÊNCIA POSITIVA
                    Ausente    Presente
                   ┌──────────┬──────────┐
    EVIDÊNCIA      │          │          │
    NEGATIVA   Aus │ PARCIAL  │ PROVADO  │
               ente│  🟡      │  🟢      │
                   ├──────────┼──────────┤
               Pres│ REFUTADO │ CONFLITO │
               ente│  🔴      │  ⚠️      │
                   └──────────┴──────────┘
```

---

## 6. Exemplos de Provas

### 6.1 Prova de Isolamento (INV-001)

```sql
-- ❌ NÃO É PROVA: "RLS está ativo"
SELECT COUNT(*) FROM pg_class WHERE relrowsecurity = true;

-- ✅ PROVA: "Isolamento funcionando"
-- Executar como tenant_a, verificar que não vê dados de tenant_b
SET LOCAL request.jwt.claims = '{"active_tenant_id": "tenant_a_id"}';
SELECT COUNT(*) FROM agents; -- Deve retornar apenas agentes de tenant_a
```

### 6.2 Prova de HMAC (INV-002)

```sql
-- ❌ NÃO É PROVA: "Função HMAC existe"
SELECT COUNT(*) FROM pg_proc WHERE proname LIKE '%hmac%';

-- ✅ PROVA: "HMAC está sendo usado"
SELECT COUNT(*) FROM hmac_signatures 
WHERE used_at > NOW() - INTERVAL '1 hour';
-- ESPERADO: > 0 se agentes estão ativos
```

### 6.3 Prova de Side Effects (INV-008)

```sql
-- ❌ NÃO É PROVA: "Trigger existe"
SELECT COUNT(*) FROM pg_trigger 
WHERE tgname = 'trg_enforce_job_side_effects';

-- ✅ PROVA: "Side effects aplicados"
SELECT COUNT(*) FROM jobs 
WHERE status = 'completed' AND output IS NULL;
-- ESPERADO: 0 (nenhuma violação)
```

### 6.4 Prova de Secrets Seguros (INV-003)

```sql
-- ❌ NÃO É PROVA: "View não expõe secrets"
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'agents_safe';

-- ✅ PROVA: "Secrets realmente ocultos"
SELECT hmac_secret FROM agents_safe LIMIT 1;
-- ESPERADO: Erro ou NULL (coluna não existe na view)
```

---

## 7. Checklist de Auditoria

### Template Reproduzível

```markdown
## Auditoria Nullmann - [DATA]

### Inventário
- [ ] Listar todas as invariantes de segurança
- [ ] Atribuir IDs únicos (INV-XXX)
- [ ] Definir queries de prova para cada uma

### Coleta de Evidência
- [ ] Executar queries em ambiente de produção
- [ ] Capturar resultados com timestamps
- [ ] Documentar contradições encontradas

### Classificação
- [ ] Atribuir estado a cada invariante
- [ ] Identificar ações corretivas para REFUTADOS
- [ ] Priorizar por severidade (P0 > P1 > P2 > P3)

### Ações
- [ ] Criar tickets para correções
- [ ] Definir prazos baseados em severidade
- [ ] Agendar re-auditoria pós-correção
```

---

## 8. Aplicação no CyberShield

### 8.1 Invariantes Documentadas

| ID | Invariante | Descrição | Query de Prova |
|----|------------|-----------|----------------|
| INV-001 | Isolamento | RLS + views tenant-scoped | `SELECT DISTINCT tenant_id FROM agents` |
| INV-002 | HMAC | Auth obrigatória em endpoints | `SELECT COUNT(*) FROM hmac_signatures` |
| INV-003 | Secrets | Nunca expostos em views | `SELECT hmac_secret FROM agents_safe` |
| INV-004 | Keys | Não armazenadas em plaintext | `SELECT key FROM enrollment_keys` |
| INV-005 | Auditoria | Logs imutáveis | `DELETE FROM audit_logs` (deve falhar) |
| INV-006 | Escalada | search_path fixado | `SHOW search_path` em funções |
| INV-007 | Replay | Nonces únicos | `SELECT nonce, COUNT(*) FROM hmac_signatures GROUP BY nonce HAVING COUNT(*) > 1` |
| INV-008 | Side Effects | Jobs completed têm output | `SELECT COUNT(*) FROM jobs WHERE status='completed' AND output IS NULL` |
| INV-009 | Errors | Falhas logadas | `SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '1 day'` |
| INV-010 | Expiry | Jobs expirados não executam | `SELECT COUNT(*) FROM jobs WHERE status='completed' AND completed_at > expires_at` |

### 8.2 Dashboard de Status

```
┌────────────────────────────────────────────────────────────┐
│               CYBERSHIELD - STATUS NULLMANN                │
├────────────────────────────────────────────────────────────┤
│  INV-001 Isolamento      │ 🟢 PROVADO   │ 100% compliant  │
│  INV-002 HMAC            │ 🟡 PARCIAL   │ Logs pending    │
│  INV-003 Secrets         │ 🟢 PROVADO   │ Views seguras   │
│  INV-004 Keys            │ 🟢 PROVADO   │ Hashed          │
│  INV-005 Auditoria       │ 🟢 PROVADO   │ Imutável        │
│  INV-006 Escalada        │ 🟢 PROVADO   │ search_path ok  │
│  INV-007 Replay          │ 🟡 PARCIAL   │ Aguardando data │
│  INV-008 Side Effects    │ 🟢 PROVADO   │ 0 violações     │
│  INV-009 Errors          │ 🟢 PROVADO   │ Logging ativo   │
│  INV-010 Expiry          │ 🟢 PROVADO   │ Constraint ok   │
├────────────────────────────────────────────────────────────┤
│  SCORE GLOBAL: 8/10 PROVADO │ 2/10 PARCIAL │ 0/10 REFUTADO │
└────────────────────────────────────────────────────────────┘
```

---

## 9. Manutenção

### 9.1 Frequência de Re-Auditoria

| Evento | Ação |
|--------|------|
| Deploy em produção | Auditoria completa |
| Alteração de RLS | Re-testar INV-001 |
| Nova edge function | Re-testar INV-002 |
| Trimestralmente | Auditoria completa |

### 9.2 Escalation

```
REFUTADO P0 → Rollback imediato + incident response
REFUTADO P1 → Fix em 24h + comunicação stakeholders  
REFUTADO P2 → Fix em 1 semana
REFUTADO P3 → Fix em 1 mês
```

---

## 10. Conclusão

A Metodologia Nullmann transforma segurança de "confiança baseada em código" para "prova baseada em evidência". Todo sistema que adota esta metodologia:

1. ✅ Tem visibilidade completa do estado real de segurança
2. ✅ Detecta regressões antes de impacto em produção
3. ✅ Fornece evidência auditável para compliance (SOC2, ISO27001)
4. ✅ Elimina falsa sensação de segurança

---

*Metodologia desenvolvida para CyberShield — Versão 1.0*  
*Última atualização: 2026-02-01*
