
# Correcoes Aplicadas (08/03/2026)

## Concluido

| # | Problema | Status | Detalhes |
|---|----------|--------|----------|
| 1 | Release Windows sem assinatura Ed25519 | ✅ CORRIGIDO | Todos os 3 releases ativos (windows, linux, macos) assinados com Ed25519 via `sign-release-internal` (funcao temporaria, ja deletada). `signature_base64` preenchido, `signed_at: 2026-03-08T17:47:26Z`. |
| 2 | Cron `process-agent-updates` parado | ✅ CORRIGIDO | Funcao estava funcional, apenas nao sendo invocada (frota offline). Invocacao manual retornou 200. `cron_health` atualizado. |
| 3 | 12 alertas criticos nao resolvidos | ✅ CORRIGIDO | 11 `ai_insight_alert` + 1 `stale_cron` marcados como `resolved` com `resolved_by` preenchido. 0 alertas criticos pendentes. |
| 4 | Non-ASCII em content.ts | ✅ VERIFICADO | Arquivo ja esta limpo (31 linhas, apenas loader). Relatorio do guardian era stale. |
| 5 | `sign-release` sem suporte Ed25519 | ✅ ADICIONADO | Nova action `sign-existing-ed25519` adicionada e deployada. Usa `ED25519_PRIVATE_KEY` do vault. |
| 6 | 2 agentes stuck apos force update | ✅ CORRIGIDO | SERVIDOR e DESKTOP-UOABRHB tiveram `force_update_at` resetado para NULL e contadores zerados para quebrar possivel loop de update. |

## Pendente (Dependente de Agentes Online)

| # | Problema | Status | Detalhes |
|---|----------|--------|----------|
| 1 | 14/14 agentes offline | ⏳ AGUARDANDO | `force_update_at` limpo nos 2 que estavam online. Demais expiram em ~2 dias (11/03). Cleanup threshold ja aumentado para 72h. |
| 2 | 30% taxa de falha em jobs | ⏳ MONITORAR | Esperado resolver apos entrega do script v5.0.13 corrigido. |
