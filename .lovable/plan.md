

# Correção: Comando de Reinstalação para Agente v6

## Causa raiz

O comando atual em `src/lib/agentReinstallCommand.ts` registra a Scheduled Task com parâmetros do agente v5 (`-ServerUrl`, `-AgentName`), mas o bundle v6 servido por `get-latest-agent-script` declara um `param()` totalmente diferente:

```powershell
param([string]$AgentToken, [string]$HmacSecret, [string]$ApiEndpoint)
```

E lê o nome do agente exclusivamente da variável de ambiente:

```powershell
$Global:AgentName = $env:CYBERSHIELD_AGENT_NAME
```

Resultado no `pcteste1`: a task inicia, o PowerShell aceita os parâmetros desconhecidos como posicionais (ou ignora), `Initialize-Config` é chamado sem `ApiEndpoint`, o agente fica sem identidade e sem endpoint, nenhum heartbeat é emitido, e a reativação nunca conclui.

## Mudanças em `src/lib/agentReinstallCommand.ts`

1. **Persistir `CYBERSHIELD_AGENT_NAME` como variável de sistema** antes de registrar a task, para que o módulo `config.ps1` resolva a identidade no boot.

   ```powershell
   [Environment]::SetEnvironmentVariable('CYBERSHIELD_AGENT_NAME', $agentName, 'Machine')
   ```

2. **Trocar os argumentos da Scheduled Task** para o contrato v6 — apenas `-ApiEndpoint`, sem tokens no CLI (continuam vindo dos arquivos `secrets/agent_token` e `secrets/hmac_secret`, que já são gravados corretamente):

   ```text
   Antes: -File "..." -ServerUrl "..." -AgentName "..."
   Depois: -File "..." -ApiEndpoint "..."
   ```

3. **Manter a gravação dos secrets em arquivo** com os nomes `agent_token` e `hmac_secret` (sem extensão) — já está correto e bate com `Get-SecretValue` no `config.ps1`.

4. **Renomear o script salvo** de `cybershield-agent-$agentName.ps1` para um caminho previsível usado pela task (mantemos o nome atual; só os args da task mudam).

## Compatibilidade com testes

O teste `agentReinstallCommand.test.ts` exige:
- `$taskArgStr` **não** pode conter `AgentToken`/`HMACSecret` ✅ (continua sem)
- Comando deve incluir o nome do agente ✅ (via `SetEnvironmentVariable`)
- Marcadores v6 (`Initialize-Config`, `Main`, `Start-HeartbeatLoop`) ✅ (preservados em `$isValidScript`)

Nenhuma alteração de teste é necessária.

## Próximo passo operacional

Após o deploy da correção, gerar novo comando de reinstalação pelo dashboard para `pcteste1` e executá-lo como Administrador na VM. O agente deve emitir heartbeat em até 60s e voltar a `online`.

## Resumo técnico

| Item | Antes | Depois |
|------|-------|--------|
| Param do endpoint | `-ServerUrl` | `-ApiEndpoint` |
| Identidade do agente | `-AgentName` (param inexistente em v6) | env var `CYBERSHIELD_AGENT_NAME` (Machine scope) |
| Tokens no CLI | Não (já correto) | Não (mantido) |
| Tokens em arquivo | `secrets/agent_token`, `secrets/hmac_secret` | Mantidos |

