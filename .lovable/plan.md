
## Fase 4 — Hotfixes de Agente (Ed25519 Key Delivery + Validação E2E)

### Contexto
O agente v5.0.15 tem 2 bugs ativos que geram ruído de erro:
1. **Ed25519**: Rejeita hash cache porque não tem a chave pública do servidor
2. **Baseline**: Crash por chave duplicada no dicionário de processos

Os hotfixes no script (Hotfix 45 + Hotfix 32) **já estão implementados** e funcionando. O que falta é entregar a chave pública Ed25519 na resposta do heartbeat para que o agente possa verificar assinaturas.

### Tarefas

#### 4.1 — Entregar Ed25519 Public Key no Heartbeat Response
- **Arquivo**: `supabase/functions/heartbeat/response-builder.ts`
- **O que**: Buscar a `ed25519_public_key` da tabela `agent_signing_keys` (ou env var) e incluí-la na resposta JSON do heartbeat
- **Custo**: $0 — reutiliza a query existente de `agent_releases`
- **Resultado**: Agente recebe a chave e pode verificar assinaturas Ed25519, eliminando os logs `REJECTED`

#### 4.2 — Validar que o Hotfix Ed25519 Fail-Open Funciona
- **Arquivo**: `supabase/functions/_shared/hotfix/toctou-integrity.ts` (já implementado)
- **Validação**: Garantir que o regex do Hotfix 45 é correto e que a idempotência funciona
- **Teste**: Deploy + curl para confirmar que o script hotfixado contém o marcador `HOTFIX-ED25519-HASHCACHE-FAILOPEN`

#### 4.3 — Validar que o Hotfix Baseline Dedup Funciona
- **Arquivo**: `supabase/functions/_shared/hotfix/feature-baseline.ts` (já implementado)
- **Validação**: Confirmar que o Hotfix 32 converte `.Add()` para indexação direta `[$key] = $value`
- **Teste**: Verificar que o marcador `HOTFIX-BASELINE-DEDUP-DICTADD` está presente no script servido

#### 4.4 — Deploy e Teste E2E
- Deploy da edge function `heartbeat` atualizada
- Curl de teste para confirmar que `ed25519_public_key` aparece na resposta
- Verificar logs da edge function para confirmar boot OK

### Checklist de Segurança
- [ ] Chave pública é read-only (não é a chave privada)
- [ ] Hotfixes são idempotentes (marcadores HOTFIX-*)
- [ ] Nenhum campo sensível exposto na resposta
- [ ] Zero custo adicional (reutiliza queries existentes)

### Estimativa de Custo
- Custo por heartbeat: +0 queries (public key vem da mesma query ou é cached)
- Custo total da fase: ~$0
