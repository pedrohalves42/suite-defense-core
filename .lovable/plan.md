

# Investigacao Completa do Sistema CyberShield

## Estado Atual do Sistema (08/03/2026, 17:40 UTC)

---

### P0 - CRITICOS

#### 1. Frota 100% Offline (14/14 agentes)
Todos os 14 agentes estao offline, incluindo o PC-Servidor-Planalto (offline ha 5.4h). Nenhum agente esta recebendo jobs ou enviando telemetria.

| Agente | Offline ha |
|--------|-----------|
| PC-Servidor-Planalto | 5.4h |
| pcteste1 | 20.9h |
| Pc-Meio-Planalto | 21.0h |
| Pc-Dani-Planalto | 44.5h |
| MIT-SERVIDOR | 99.3h |
| Pc-Bianca-Tibery | 141.5h |
| Pc-Yasmin-Tocantins | 148.1h |

**Risco:** O `force_update_at` (definido em 08/03 02:47) expira em **2 dias e 9 horas** (11/03 02:47). Agentes que nao voltarem ate la nao receberao a atualizacao forcada.

#### 2. Release Windows SEM Assinatura Ed25519
O release ativo `v5.0.13` para Windows **nao tem assinatura digital** (`signature_base64 = NULL`). Segundo a politica de seguranca do projeto (Zero Trust supply chain), agentes modernos exigem assinatura Ed25519. Isso significa que mesmo agentes que recebam o script podem rejeitar a atualizacao em modo fail-closed, ou aceitar em fail-open mas sem prova de autenticidade.

#### 3. Taxa de Falha de Jobs: 30%
Nos ultimos 7 dias: 677 completed, 452 failed, 249 cancelled, 114 expired.

Top falhas por tipo:
- `collect_certificates`: 77 falhas
- `software_inventory_collect`: 75
- `collect_antivirus_status`: 74
- `service_health_check`: 64
- `light_vuln_scan`: 50
- `collect_network_info`: 48

Positivo: nao ha jobs stuck em pending (cleanup cron funcionando).

---

### P1 - SEGURANCA

#### 4. Linter: 2 Politicas RLS Permissivas (WARN)
O linter do banco detecta 2 warnings de "RLS Policy Always True". Investigacao mostra que todas as politicas `USING(true)` remanescentes estao restritas ao role `service_role`, o que e um padrao aceitavel (service_role e o backend privilegiado). **O linter gera falso-positivo para essas.** Nao ha politicas permissivas para `authenticated` ou `anon`.

**Acao:** Nenhuma correcao necessaria - as politicas sao intencionais para service_role. O warning do linter pode ser ignorado.

#### 5. Funcoes SECURITY DEFINER sem search_path - CORRIGIDO
A query confirma que **nao existem mais** funcoes SECURITY DEFINER sem search_path. A migracao anterior (`20260308171755`) corrigiu `enforce_job_state_transitions` e `ensure_completed_at_on_terminal`.

#### 6. 12 Alertas Criticos Nao Resolvidos
- 11 alertas `ai_insight_alert` (CPU/memoria critica em endpoints)
- 1 alerta `stale_cron` (process-agent-updates sem sucesso ha 4h+, desde 02/03)

O alerta de `stale_cron` para `process-agent-updates` indica que esta funcao cron nao esta executando com sucesso desde 02/03.

---

### P2 - OPERACIONAL

#### 7. Non-ASCII em agent-script-windows-content.ts
O `guardian-report.json` aponta 2 ocorrencias em `agent-script-windows-content.ts` (linhas 470 e 714). O arquivo v3 do PowerShell ja foi corrigido, mas o content.ts compartilhado ainda tem os caracteres.

#### 8. Lint/validate:all Falhando
O `eslint-plugin-multitenant/dist/` foi criado na sessao anterior, mas o CI pode nao ter o dist commitado. Precisa verificar se os arquivos compilados estao no repositorio.

#### 9. Edge Function Logs Vazios
Nenhum log de edge function esta disponivel (heartbeat, maintenance-cron, sync-scripts-direct). Isso pode indicar que as funcoes nao estao sendo invocadas (frota offline) ou que os logs expiraram.

---

## Plano de Correcao Priorizado

### Correcao 1: Assinar o Release Windows v5.0.13
Criar e executar uma migracao ou edge function que assine o release ativo com Ed25519, preenchendo `signature_base64`. Sem isso, agentes em modo fail-closed rejeitarao o update.

### Correcao 2: Resolver alerta stale_cron de process-agent-updates
Investigar por que `process-agent-updates` nao executa com sucesso desde 02/03 e corrigir.

### Correcao 3: Limpar non-ASCII em agent-script-windows-content.ts
Substituir os 2 comentarios com acentos (linhas 470 e 714) por equivalentes ASCII.

### Correcao 4: Resolver alertas criticos nao resolvidos
Auto-resolver ou marcar como acknowledged os 11 alertas de AI insight que estao acumulando sem resolucao.

### Correcao 5: Monitorar expiracao do force_update
O force_update expira em ~2.4 dias. Se agentes nao voltarem, considerar um mecanismo de persistencia permanente ou re-trigger automatico.

---

## Resumo

```text
Prioridade  Problema                             Acao
────────────────────────────────────────────────────────────
P0-CRIT  1. 14/14 agentes offline               Aguardar + monitorar expiracao
P0-CRIT  2. Release sem assinatura Ed25519       Assinar via edge function
P0-CRIT  3. 30% jobs falhando                   Resolver apos entrega do script
P1-SEC   4. 2 warnings RLS (service_role)        Falso-positivo, ignorar
P1-SEC   5. Funcoes sem search_path              JA CORRIGIDO
P1-SEC   6. 12 alertas criticos pendentes        Resolver/acknowledge
P2-OPS   7. Non-ASCII em content.ts              Correcao simples
P2-OPS   8. Lint possivelmente falhando no CI    Verificar dist commitado
P2-OPS   9. Edge function logs vazios            Investigar pos-frota online
```

### O que este plano fara:
1. Assinar o release Windows para garantir que agentes aceitem a atualizacao
2. Corrigir o cron `process-agent-updates` que esta parado
3. Limpar caracteres non-ASCII remanescentes
4. Resolver alertas acumulados

