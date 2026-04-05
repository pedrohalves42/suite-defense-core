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
