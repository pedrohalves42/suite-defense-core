
## Fase 3 — Edge Function `soc2-evidence-collector` + Validação End-to-End

### 🚨 Bloqueio Crítico Identificado
A Edge Function `soc2-evidence-collector` (Fase 1) **NÃO EXISTE** — o diretório está vazio. O Wizard (Fase 2) e o hook `useSOC2EvidenceCollector` chamam esta função mas ela falhará com 404. **Fase 3 = criar a função + validar tudo.**

---

### 3.1 — Criar Edge Function `soc2-evidence-collector/index.ts`
**Objetivo:** Coletar evidências de conformidade SOC 2 do banco de dados em uma ÚNICA chamada.

**O que faz (custo-eficiente):**
1. Recebe `{ save: boolean }` no body
2. Consulta tabelas existentes para extrair evidências reais:
   - `user_roles` → CC1.3 (RBAC), CC6.1 (Logical access)
   - `audit_logs` → CC1.5 (Accountability), CC7.1 (Monitoring)
   - `agents` → CC6.2 (Authentication), CC7.2 (Anomaly detection)
   - `alert_rules` → CC7.2 (Anomaly detection)
   - `enrollment_keys` → CC6.3 (Registration)
   - `compliance_policies` → CC2.1 (Internal communication)
   - `soc2_controls` → Status geral dos controles
3. Calcula `strength` por controle (strong/moderate/weak/none) baseado na contagem
4. Se `save=true`, persiste na tabela `soc2_evidence` existente
5. Retorna o formato `EvidenceCollectionResult` esperado pelo hook

**Princípios de custo:**
- UMA única invocação coleta TUDO (não por controle)
- Queries paralelas com `Promise.all` (3-4 queries ao invés de 30+)
- Sem chamadas de IA (puro SQL)
- Response cacheável no frontend

### 3.2 — Validação do Hook `useSOC2EvidenceCollector`
- Verificar que o hook envia corretamente `{ save }` no body
- Confirmar que o tipo `EvidenceCollectionResult` está alinhado com a response da função
- Testar que o cache no React state evita chamadas repetidas

### 3.3 — Validação do Wizard `SOC2PolicyWizard.tsx`
- Confirmar que `handleAutoFillAll` e `handleAutoFillCurrent` funcionam com dados reais
- Verificar que `handleSave` grava corretamente em `soc2_criteria` e `soc2_control_status`
- Testar os badges de força (🔴🟡🟢) com dados reais

### 3.4 — Deploy e Teste End-to-End
- Deploy da edge function
- Teste via `curl` para validar resposta
- Verificar logs da edge function para erros

---

### Arquitetura de Custos

| Componente | Custo | Justificativa |
|------------|-------|---------------|
| Edge Function | ~$0.001/invocação | Apenas queries SQL, sem IA |
| Queries DB | 3-4 paralelas | Promise.all, não sequenciais |
| Frontend cache | $0 | State React, sem re-fetch |
| Persistência | Opcional (save=true) | Só quando usuário pede |

### Arquivos Criados/Modificados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/soc2-evidence-collector/index.ts` | **CRIAR** |
| `src/hooks/useSOC2EvidenceCollector.ts` | Validar (sem mudanças esperadas) |
| `src/components/soc2/SOC2PolicyWizard.tsx` | Validar (sem mudanças esperadas) |
