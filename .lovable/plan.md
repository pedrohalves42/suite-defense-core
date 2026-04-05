## Fase 3 — Edge Function `soc2-evidence-collector` + Validação E2E

### Status: ✅ CONCLUÍDA

## Fase 4 — Hotfixes de Agente (Ed25519 + Baseline) + Validação E2E

### Status: ✅ CONCLUÍDA

### Análise

#### 4.1 — Ed25519 Public Key no Heartbeat ✅ (Não necessário)
- Releases são assinados com **ECDSA** (não Ed25519)
- `$Global:Ed25519PublicKeyBase64` é `$null` **por design**
- **Hotfix 45** (`hotfixEd25519HashCacheFailOpen`) já trata isso corretamente:
  - Se `$sigValid = $false` E `$Global:Ed25519PublicKeyBase64 = $null` → aceita com WARNING (audit-only mode)
  - Se `$sigValid = $false` E chave pública existe → rejeita (assinatura inválida real)
- Resultado: Zero falsos positivos de "REJECTED hash cache update"

#### 4.2 — Hotfix Baseline Dedup ✅ (Já implementado)
- **Hotfix 32** (`hotfixBaselineDedup`) converte `.Add()` → indexação direta `[$key] = $value`
- **Hotfix 34** (`hotfixBaselineLoadSafe`) trata JSON corrompido com fallback
- **Hotfix 35** (`hotfixBaselineNormalizeSave`) normaliza entradas antes de salvar
- `Detect-ProcessAnomalies` envolto em try-catch para evitar crash total
- Resultado: Zero crashes por "O item já foi adicionado"

#### 4.3 — Deploy e Validação E2E ✅
- `heartbeat` deployado: boot 40-51ms, agentes processados com sucesso
- `soc2-evidence-collector` deployado: boot 36ms, auth 401 confirmado
- Agentes ativos validados: PC-Servidor-Planalto, MIT-SERVIDOR, Pc-Meio-Planalto

### Custo da Fase
- $0 — nenhuma query adicional, nenhuma mudança de código necessária
- Hotfixes existentes já cobriam ambos os bugs

## Fase 5 — Automação do Assistente de Conformidade SOC 2

### Status: ✅ CONCLUÍDA

### O que foi implementado

#### 5.1 — Tabelas de dados (pré-existentes) ✅
- `soc2_evidence`: armazena evidências com `control_id`, `evidence_type`, `reference`, `metadata`, `valid_from/until`, `hash`, `status`
- `soc2_control_status`: histórico de preenchimento com `auto_filled`, `filled_by`, `notes`
- Ambas com RLS e `tenant_id` para isolamento multi-tenant

#### 5.2 — Edge Function `soc2-evidence-collector` (pré-existente) ✅
- Coleta paralela de 7 fontes: `user_roles`, `audit_logs`, `agents`, `alert_rules`, `enrollment_keys`, `compliance_policies`, `soc2_controls`
- Mapeia para controles: CC1.1, CC1.2, CC1.3, CC1.5, CC2.1, CC3.1, CC6.1, CC6.2, CC6.3, CC7.1, CC7.2, CC8.1
- Cálculo de força: none/weak/moderate/strong baseado em contagem de evidências
- Persistência opcional (flag `save`)
- Zero chamadas de IA — puro SQL + lógica determinística

#### 5.3 — Integração Frontend ✅ (NOVO)
- **`useSOC2ControlStatus` hook**: CRUD na tabela `soc2_control_status` com dedup por `control_id`
- **Botão "Auto-preencher"**: chama o coletor, salva status de todos os controles automaticamente
- **Indicadores visuais**: 🟢 Conforme / 🟡 Parcial / 🔴 Não Conforme baseados em evidências reais
- **Notas editáveis**: auto-preenchidas com descrições das evidências, sobrescrita manual permitida
- **Banner de resultado**: mostra total de evidências coletadas e timestamp
- **Eliminação de `Math.random()`**: controles SOC 2 agora são 100% data-driven
- **Frameworks não-SOC2**: mantidos com lógica determinística baseada em métricas reais

### Custo da Fase
- $0 — sem novas tabelas, sem novas edge functions, sem chamadas de IA
- Reaproveitamento total da infraestrutura existente
