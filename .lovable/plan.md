

# Plano: Corrigir TLS 1.2 no Agente Windows e Script de Reinstalação

## Resumo do Problema

O **MIT-SERVIDOR** (Windows Server 2012/2016) não consegue comunicar com o backend porque:
1. PowerShell usa TLS 1.0 por padrão
2. Supabase requer TLS 1.2+
3. Script do agente não força TLS 1.2 no início

## Evidências dos Screenshots

| Item | Valor |
|------|-------|
| Erro SSL/TLS | `Não foi possível criar um canal seguro para SSL/TLS` |
| Task Status | `CyberShieldAgent-MIT-SERVIDOR: Running` |
| Estado FSM | `DEGRADED` (correto - falta DNS filter) |
| Último Bootstrap | `10:54:00` - 3 horas atrás, sem heartbeat depois |

## Correções Necessárias

### Correção 1: Script de Reinstalação (get-reinstall-preserve-script)

Adicionar TLS 1.2 no início do script servido pela edge function:

```powershell
# Linha 1 do script - ANTES de qualquer Invoke-RestMethod
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

**Arquivo**: `supabase/functions/_shared/reinstall-preserve-script-content.ts`

### Correção 2: Agente Principal (v4.ps1)

Garantir que o agente força TLS 1.2 antes de qualquer comunicação HTTP:

```powershell
# No início do script, após parâmetros
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

**Arquivos**:
- `public/agent-scripts/cybershield-agent-windows-v4.ps1`
- `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v4.ps1`
- `scripts/cybershield-agent-windows-v4.1.2.ps1`

### Correção 3: Documentação de Troubleshooting

Adicionar seção sobre TLS no `docs/AGENT_TROUBLESHOOTING_NINJA.md`

## Validações Pós-Correção

1. Verificar se MIT-SERVIDOR volta online após executar comando com TLS 1.2
2. Confirmar heartbeat no banco de dados
3. Verificar se poll-jobs está funcionando

## Resumo de Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/_shared/reinstall-preserve-script-content.ts` | Adicionar TLS 1.2 no início |
| `public/agent-scripts/cybershield-agent-windows-v4.ps1` | Garantir TLS 1.2 |
| `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v4.ps1` | Garantir TLS 1.2 |
| `scripts/cybershield-agent-windows-v4.1.2.ps1` | Garantir TLS 1.2 |
| `docs/AGENT_TROUBLESHOOTING_NINJA.md` | Documentar problema TLS |

