# ADR-004 — Hardening Wave 1: Windows Agent + Bootstrap

**Date:** 2026-06-18
**Status:** Accepted
**Scope:** `agents/windows/**`, `agents/windows/bootstrap.ps1`

## Context

Sweep ampla de tratamento de erros e bugs reais, conforme plano aprovado.
Onda 1 cobre o agente Windows e o lockfile da Fase 6.6.

## Findings & Fixes

| ID | Local | Problema | Fix |
|----|-------|----------|-----|
| B1 | `modules/utils.ps1` `Invoke-SecureApi` | TraceId regenerado a cada retry quebra correlação backend↔agent | Gerar uma vez antes do loop, persistir em `$script:CurrentTraceId`, restaurar no `finally` |
| B2 | `modules/utils.ps1` | `Invoke-RestMethod` sem `TimeoutSec` trava heartbeat em rede degradada | `TimeoutSec = 30` (parametrizável) |
| B3 | `modules/utils.ps1` | `Get-Random -Maximum 0` lança `ArgumentOutOfRangeException` se delay colapsar | Clamp `Maximum >= 1` |
| B4 | `modules/state.ps1` `Get-SavedAgentState` | `catch {}` engole state file corrompido silenciosamente | Log WARN + quarentena (`.corrupt-<ts>`) |
| B5 | `modules/state.ps1` `Set-AgentState` | Escrita não-atômica → arquivo truncado se processo morrer | Escrita em `.tmp` + `Move-Item -Force` (rename atômico NTFS) |
| B6 | `bootstrap.ps1` `ConvertTo-NormalVersion` | `[Version]"7.4.6" -ne [Version]"7.4.6.0"` (Revision -1 vs 0) → falso drift contra `winget` | Pad para 4 componentes antes de comparar |
| B7 | `bootstrap.ps1` `Get-WingetVersion` | Layout real é `Name Id Version Available Source` — `$cols[1]` retornava o **Id** | Detectar primeira coluna que case `^\d+(\.\d+){1,3}$` |

## Verification

- Lint: PSScriptAnalyzer já configurado via `PSScriptAnalyzerSettings.Hex.psd1`.
- Testes: `tests/state.Tests.ps1` e `tests/bootstrap.Tests.ps1` cobrem os caminhos felizes; B4/B5/B6/B7 podem receber casos dedicados em uma onda futura.
- Compatibilidade: nenhum contrato público alterado (mesmas assinaturas de função, mesmos parâmetros, mesmos arquivos JSON).

## Out of Scope (próximas ondas)

- Onda 2: Linux/macOS agents (`agents/linux/**`, `agents/macos/**`, `agents/unix/lib/**`).
- Onda 3: Edge functions (`supabase/functions/**`).
- Onda 4: Frontend (`src/**`).
- Onda 5: Scripts / CI / `dns-filter/**`.
