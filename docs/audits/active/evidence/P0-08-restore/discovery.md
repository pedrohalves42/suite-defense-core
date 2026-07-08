# P0-08 — Backup + restore verificado · Discovery Note (Sprint 0 · Day 1)

- Date: 2026-07-08
- Owner: Ops Lead
- Mode: read-only inspection

## Perguntas guiadas

1. **Existe hoje?** Backup automático de banco existe por padrão em
   Lovable Cloud (snapshot de plataforma). **Restore verificado
   periodicamente NÃO existe** — não há artefato do processo.
2. **Como sei?**
   - `rg -l -iE "backup|restore|pg_dump|snapshot" docs scripts`:
     **0 hits**.
   - Nenhum runbook publicado em `docs/runbooks/`.
   - Nenhum script em `scripts/` para restore em ambiente isolado.
3. **Reproduz?** Trivialmente: pedir para um operador restaurar o
   último snapshot em ambiente isolado e rodar smoke-test — hoje não
   existe procedimento documentado.
4. **Custo real?** Baixo-médio. O que falta é **processo + evidência**,
   não capacidade da plataforma:
   - runbook de restore em ambiente isolado;
   - script/checklist de smoke-test em 5 tabelas críticas;
   - cadência (mensal) + registro do último restore verificado.

## Sinais coletados

- `rg` em `docs/` e `scripts/`: **0 hits** para
  backup/restore/pg_dump/snapshot.
- Nenhum item em `docs/runbooks/` (diretório sequer existe hoje).
- Plataforma provê backup — capacidade técnica presente.

## Classificação Discovery

**Confirmed.**

O gap é real e documental: sem restore testado, backup é apenas
teórico. Não há dependência de código de runtime.

## Próxima ação

- Criar `docs/runbooks/restore.md` (fase de execução, não agora).
- Executar 1 restore em ambiente isolado + smoke-test.
- Anexar evidência **DEPOIS** em `evidence/P0-08-restore/after.md`
  com timestamp, snapshot ID e resultado dos smokes.
- Estabelecer cadência mensal.

## Restrições respeitadas

- Nenhum código tocado.
- Nenhum backup/restore executado nesta janela (apenas inspeção
  documental).

## Referências

- `hardening-tracking-board.md` linha P0-08.
- `pilot-readiness-review.md` — restore verificado é pré-requisito.
