# P0-07 — Signing / integridade do installer · Discovery Note (Sprint 0 · Day 1)

- Date: 2026-07-08
- Owner: Security Lead
- Mode: read-only inspection

## Perguntas guiadas

1. **Existe hoje?** Não observado em inspeção estática das funções de
   installer.
2. **Como sei?**
   - `rg -l -iE "hmac|signature|manifest_sha256|sha256|verifyHmac|timingSafeEqual"`
     em `generate-portable-installer`, `build-agent-exe`,
     `serve-installer`, `register-agent-release`, `promote-agent-v5`:
     **0 hits**.
   - Isto **não prova** ausência do controle — pode existir em
     `_shared/` ou em outra função com nome diferente — mas é forte
     indicador de que as funções de emissão/entrega do installer não
     assinam nem verificam integridade localmente.
3. **Reproduz?** Sim, condicional: baixar installer, alterar 1 byte,
   tentar executar. Se executar sem recusa, controle inexistente.
4. **Custo real?** Se `Confirmed`, é implementação nova de:
   - assinatura HMAC-SHA256 no `build-agent-exe`/`generate-portable-installer`;
   - manifest publicado + endpoint de chave pública/segredo;
   - verificação obrigatória no agente antes de executar;
   - trilha em `audit_log`.
   Trabalho não trivial. Toca **`_shared/security`** — precisa autorização
   explícita para sair do freeze só dessa área específica.

## Sinais coletados

- Funções inspecionadas (todas as candidatas por nome):
  - `supabase/functions/generate-portable-installer`
  - `supabase/functions/build-agent-exe`
  - `supabase/functions/serve-installer`
  - `supabase/functions/register-agent-release`
  - `supabase/functions/promote-agent-v5`
- Palavras-chave de assinatura em qualquer uma delas: **0**.
- Memória do projeto (`mem://security/agent-installer-integrity-validation`)
  descreve padrão "download-verify-execute" — indica que o **padrão
  está definido**, mas o código emissor pesquisado não referencia
  primitivas de assinatura.

## Classificação Discovery

**Needs Investigation.**

Justificativa: a ausência de hits em 5 funções candidatas é significativa
mas não conclusiva. Antes de classificar `Confirmed`, exigir spike
curto (0.5 dia) para:

- procurar assinatura em `_shared/` e no runtime do agente;
- reproduzir o teste do hash adulterado.

Se o teste executar mesmo com hash alterado → `Confirmed`. Caso a
verificação exista no agente (fora deste repo) → `False Positive`
com evidência anexa.

## Próxima ação

- Spike de 0.5 dia mapeando `_shared/` + código do agente.
- Documentar resultado em `discovery.md` (append) antes de qualquer
  correção.

## Restrições respeitadas

- Nenhum código tocado.
- Nenhuma tentativa de execução de installer real nesta janela.

## Referências

- `mem://security/agent-installer-integrity-validation`
- `hardening-tracking-board.md` linha P0-07.
