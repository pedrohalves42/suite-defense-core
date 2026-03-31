# Runbook: Falha de Deploy de Edge Functions

**Severidade**: Alta
**Meta MTTR**: < 30 minutos
**Escalacao**: Se funcao critica (heartbeat, poll-jobs, enroll-agent) afetada

---

## Sintomas

- Deploy falha com `SUPABASE_CODEGEN_ERROR`
- Edge Function retornando 502/503 apos deploy
- Funcao nao responde apos atualizacao
- Erro de bundling no pipeline CI

---

## Causas Comuns

| Causa | Frequencia | Solucao |
|-------|-----------|---------|
| CORS headers orfaos no corpo da funcao | Alta | Usar apenas `buildCorsHeaders(origin)` |
| Import de modulo inexistente | Media | Verificar paths de import |
| Syntax error em TypeScript | Media | Rodar `deno check` localmente |
| Timeout de bundling | Baixa | Reduzir tamanho da funcao |
| Dependencia externa indisponivel | Baixa | Usar versao fixa no import |

---

## Diagnostico

### 1. Verificar Logs de Deploy

Consultar output do pipeline CI/CD ou logs do Supabase dashboard.

### 2. Verificar Sintaxe

```bash
deno check supabase/functions/<nome>/index.ts
```

### 3. Verificar Imports

```bash
grep -r "import " supabase/functions/<nome>/index.ts
```

---

## Procedimento de Resolucao

### 1. Rollback (se funcao critica afetada)

- Reverter para versao anterior via git
- Redeployar funcao especifica

### 2. Correcao

- Seguir padrao de CORS via middleware (`buildCorsHeaders`)
- Verificar que imports usam caminhos relativos corretos
- Garantir que `supabase/config.toml` esta valido

### 3. Validacao

- Testar funcao localmente com `supabase functions serve`
- Executar testes de integracao
- Verificar resposta em staging antes de producao

---

## Prevencao

| Controle | Status |
|----------|--------|
| Lint de Edge Functions no CI | Ativo |
| ASCII Guard | Ativo |
| Quality gate de 400 linhas | Ativo |
| Testes de integracao pre-deploy | Parcial |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Ops | Versao inicial |
