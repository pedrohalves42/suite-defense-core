
# Plano: TOCTOU v5.0.15 — Validação Completa da Auto-Cura

## Problemas Identificados no Código Atual

### 🔴 Bug 1: Agente não processa `force_hash_resync`
O `heartbeat.sh` (linha 22-31) processa `force_update`, `heartbeat_interval_seconds` e `poll_interval_seconds`, mas **ignora completamente** `force_hash_resync` e `script_sha256`. A auto-cura nunca acontece.

### 🔴 Bug 2: `forceHashResync` sempre `true` (sem valor)
Em `response-builder.ts` (linha 110-112), o flag é `true` para **qualquer** agente online com hash, tornando o sinal sem significado — não distingue agentes em loop de agentes saudáveis.

### 🟡 Bug 3: Query duplicada ao banco
`response-builder.ts` consulta `agent_releases` **duas vezes** (linhas 32-40 e 78-85) para o mesmo registro, desperdiçando IOPS e aumentando latência.

### 🟡 Bug 4: Fallback inseguro do `script_sha256`
Linha 125: `safeScriptSha256 || currentScriptSha256` envia o hash mesmo sem assinatura válida, contradizendo o comentário de segurança da linha 69-70 (causa falsos positivos TOCTOU).

---

## Etapas de Implementação

### Etapa 1: Corrigir `response-builder.ts` (servidor)
- **Eliminar query duplicada**: buscar `script_content` e `signature_base64` numa única consulta
- **Corrigir lógica `forceHashResync`**: enviar `true` apenas quando há evidência de instabilidade (ex: agente com status recente de restart ou SAFE_MODE)
- **Remover fallback inseguro**: enviar `script_sha256` SOMENTE quando há assinatura válida
- **Resultado**: menos queries, resposta correta, custo menor

### Etapa 2: Implementar processamento no agente (`heartbeat.sh`)
- Adicionar leitura de `script_sha256` e `force_hash_resync` da resposta do heartbeat
- Quando `force_hash_resync=true` e `script_sha256` presente: atualizar o cache local (`expected_script_hash.json`) com o hash do servidor
- Resetar contador `TOCTOU_CONSECUTIVE_FAILURES` após resync bem-sucedido
- **Resultado**: agente se auto-cura sem reinstalação

### Etapa 3: Atualizar teste unitário (`response-builder.test.ts`)
- Testar cenário sem release (hash null)
- Testar cenário com release assinada (hash presente)
- Testar cenário com release sem assinatura (hash NÃO enviado)
- Testar que `force_hash_resync` reflete o estado real do agente

### Etapa 4: Validação em produção via curl
- Testar endpoint heartbeat com agente real para confirmar resposta correta
- Verificar logs para ausência de erros

---

## Impacto em Custos
- **Antes**: 3 queries por heartbeat × ~3 agentes × ~60 heartbeats/hora = ~540 queries/hora
- **Depois**: 1 query por heartbeat = ~180 queries/hora (redução de 67%)
