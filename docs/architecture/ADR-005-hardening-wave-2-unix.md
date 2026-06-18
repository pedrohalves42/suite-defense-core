# ADR-005 — Hardening Wave 2: Agentes Unix (Linux + macOS + shared lib)

**Status:** Implemented  
**Date:** 2026-06-18  
**Scope:** `agents/unix/lib/**`, `agents/linux/modules/**`, `agents/macos/modules/**`  
**Predecessors:** ADR-004 (Wave 1 — Windows)

## Princípios respeitados
- Sem mudança de contrato público (endpoints, payloads, schemas).
- Endurecer caminhos de erro / parsing / cross-platform sem refactor estrutural.
- Saídas JSON construídas via `jq -n --arg` (SSA-024/025) onde possível.
- Compatibilidade bash 3.2 (macOS) — proibido `${var,,}` e `${var^^}`.

## Bugs corrigidos

### B8 — `fsm.sh` corrompido por escape de aspas (P0)
**Problema:** Linhas 19–30 usavam `\"…\"` literal em vez de aspas reais. Resultado: o estado era persistido em arquivos cujo nome continha aspas literais, o log recebia `level="INFO"` com aspas como parte do argumento, e o heredoc gravava em path inválido. A FSM inteira estava quebrada silenciosamente.  
**Solução:** Reescrita completa de `set_agent_state` com:
- Aspas corretas em toda atribuição/comparação.
- Persistência atômica via `tmp + mv -f` (NTFS-style rename).
- Reversão in-memory garantida em qualquer falha de I/O.
- Validação de transição usando glob match (`*" $new_state "*`) em vez de `=~` frágil.

### B9 — `crypto.sh::sign_execution_result` corrompido (P0)
**Problema:** Mesmo padrão `\"…\"`. `openssl dgst -sign` recebia `"$PRIVATE_KEY_PATH"` (com aspas literais), arquivo inexistente, retorno vazio sem código de erro. Toda assinatura de execução de job estava quebrada.  
**Solução:** Reescrita com `printf '%s'`, fallback `base64` (sem `-w0`) para macOS, fail-closed explícito quando a chave privada não existe (`return 1`).

### B10 — `jobs.sh::poll_jobs` / `_dispatch_job` / handlers corrompidos (P0)
**Problema:** Mesmo padrão de escape. `jq -n --arg an \"$AGENT_NAME\"` injetava `"valor"` (com aspas) dentro do JSON. `case \"$type\" in \"collect_network_info\")` comparava `"collect_network_info"` literal — nenhum job_type fazia match.  
**Solução:** Arquivo reescrito do zero. Adicionado:
- Validação `jq -e 'type == "array"'` no retorno de `poll_jobs`.
- Wrap de output não-JSON em `{raw_output: …}` antes de hash.
- `dispatch_rc` capturado para distinguir handler ausente vs falha.
- Fallback `shasum -a 256` para macOS.
- `--argjson` para campos numéricos (`duration`, `execution_index`).

### B11 — `crypto.sh::register_agent_key` capturava `$?` errado
**Problema:** `local result=$(...)` reseta `$?`; o `if [[ $? -eq 0 ]]` seguinte sempre era 0 (sucesso do `local`).  
**Solução:** Separar declaração e atribuição, capturar `rc=$?` imediatamente.

### B12 — `integrity.sh` usava `${expected_hash,,}` (bash 4+)
**Problema:** Sintaxe não suportada em bash 3.2 do macOS — `test_runtime_integrity` falhava com erro de parse na primeira execução em macOS.  
**Solução:** `tr 'A-F' 'a-f'` para lowercasing portável. Fallback `shasum -a 256` se `sha256sum` ausente.

### B13 — `agents/{linux,macos}/modules/update.sh` mesmo problema
**Solução:** Mesmo patch portável (`tr 'A-F' 'a-f'`).

### B14 — `linux/modules/metrics.sh` divisão por zero
**Problema:** Se `/proc/meminfo` indisponível, `mem_total=0` causa erro em `bc` (`scale=2; X*100/0`). Sob `set -e` derrubava a coleta inteira.  
**Solução:** Guard `if [[ mem_total -gt 0 ]]` com defaults 0. Também default para `disk_percent` quando df falha.

### B15 — `macos/modules/metrics.sh::_get_cpu_percent` retornava float
**Problema:** `top -l 1 -n 0` retorna `5.42%`. Bash aritmético (`[[ $current_cpu -gt 80 ]]` no main-loop) falha com `integer expression expected`.  
**Solução:** Soma `user + sys` via `awk` com `%d` printf (truncamento inteiro), default `0`.

### B16 — `macos/modules/handlers.sh::_collect_software_inventory` produzia JSON inválido
**Problema:** `grep -c "Location:" || echo 0` — quando grep encontra 0 matches, retorna exit 1 E imprime `0` em stdout; o `|| echo 0` adiciona segundo `0`, gerando `software_count: 0\n0` (JSON quebrado).  
**Solução:** Capturar resultado, validar com regex `^[0-9]+$`, default 0.

## Não corrigidos nesta onda (rastreados para wave futura)
- `update.sh` macOS usa `readlink "$0"` (sem `-f`) — só segue um símbolo; aceito porque `$0` em runtime normal é caminho absoluto.
- `_disk_cleanup_handler` calcula `freed_gb=(after - before)` em GB inteiros — pode mostrar 0 mesmo após limpeza de MBs; baixa prioridade.
- `_apply_forced_update` Linux usa `nohup … &` + `exit 0`; falha silenciosa do exec não é detectável. Aceito (systemd-restart é o caminho primário).

## Verificação
- `bash -n` clean em todos os arquivos alterados (`fsm.sh`, `crypto.sh`, `jobs.sh`, `integrity.sh`, `linux/{metrics,update,handlers}.sh`, `macos/{metrics,update,handlers}.sh`).
- Smoke test executado em `/tmp/test_wave2.sh`:
  - Transições FSM válidas/inválidas → ✅
  - Estado persistido como JSON válido → ✅
  - `sign_execution_result` fail-closed sem chave → ✅
  - `_dispatch_job` aceita conhecidos e rejeita desconhecidos → ✅
  - `execute_job` empacota saída e marca `completed` → ✅
  - Caminho que requer `openssl` real não pôde ser exercitado no sandbox.

## Próxima onda
Wave 3 — Edge functions (`supabase/functions/**`): try/catch em `supabase.from()`, `AbortSignal.timeout(...)`, normalização de respostas de erro, validação Zod sem `.passthrough()` indevido, `null` em `.maybeSingle()`.
