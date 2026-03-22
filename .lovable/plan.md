

## Análise do Log do pcteste1 — Bug de Inicialização de Chaves

### Problema Identificado

O log mostra **dois boots** do agente em sequência (15:12:36 e 15:13:27):

**1º boot — DEGRADED** (falhou):
- `CngKey.Create` **SUCEDEU** na tentativa 1 (ECDSA keypair gerado)
- Mas `ExportPkcs8PrivateKey()` falhou (.NET Framework 4.x não tem este método)
- A exceção foi capturada pelo `catch` EXTERNO da função (linha 1649), pulando TODOS os fallbacks (RSA.Create, RSACryptoServiceProvider)
- Resultado: `SecurityDegraded=TRUE`, jobs bloqueados

**2º boot — ENFORCING** (sucedeu):
- `CngKey.Create` **FALHOU** 3x ("O objeto já existe" — chave órfã do 1º boot)
- O código entrou na cadeia de fallback corretamente
- `ECDsaCng(256)` → ExportPkcs8 falhou → `RSA.Create(2048)` → ExportPkcs8 falhou → **RSACryptoServiceProvider SUCEDEU**
- Resultado: Agent operacional

### Bug Root Cause

No script fonte (`cybershield-agent-windows-v5.ps1`, linhas 1596-1602), quando o loop `for` termina com `$ecdsa` válido (CngKey criou com sucesso), o código tenta:

```powershell
$privateKeyBytes = $ecdsa.ExportPkcs8PrivateKey()  # ← FALHA no .NET 4.x
```

Esta exceção vai direto para o `catch` externo (linha 1649) e retorna `$false`, **sem nunca tentar RSACryptoServiceProvider**. Os fallbacks RSA só são acionados quando `CngKey.Create` falha 3x.

### Fix

Envolver as linhas 1596-1602 em um try/catch que, em caso de falha no export ECDSA, redirecione para o RSACryptoServiceProvider (mesmo fallback já existente nas linhas 1550-1582).

**Arquivo**: `supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1` (linhas 1594-1648)

Substituir o bloco de export direto por:

```powershell
# After loop: export ECDSA keys, with RSA-CSP fallback for .NET 4.x
if ($null -ne $ecdsa) {
    try {
        $privateKeyBytes = $ecdsa.ExportPkcs8PrivateKey()
        $publicKeyBytes  = $ecdsa.ExportSubjectPublicKeyInfo()
        # ... (existing ECDSA save logic)
    } catch {
        Write-Log "[KEYS] ECDSA export failed ($($_.Exception.Message)) - falling to RSACryptoServiceProvider" "WARN"
        $ecdsa.Dispose()
        $ecdsa = $null
        # RSACryptoServiceProvider fallback (same code as line 1550-1582)
    }
}
if ($null -eq $ecdsa) {
    # RSACryptoServiceProvider fallback
}
```

**Also applies to**: `public/agent-scripts/cybershield-agent-windows-v5.ps1` (mirror copy)

### Outros Problemas Menores no Log

| Issue | Severidade | Ação |
|-------|-----------|------|
| Baseline "duplicate key: name" | Auto-healed | Nenhuma — o agente reconstrói sozinho |
| USB SanDisk (sighting #1, #2) | Esperado | Auto-whitelist no sighting #3 |
| ECDSA CngKey "Objeto já existe" 3x | Ruído | Fix já reduz: OverwriteExistingKey no hotfix existente não aplicou neste script |

### Hotfix System

Também adicionar um **novo hotfix** em `windows-script-hotfix.ts` para capturar scripts já deployed que têm o export desprotegido — garantindo que o fix atinja agentes que não atualizarem imediatamente o script fonte.

### Resumo de Mudanças

1. **`supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1`** — Wrap ECDSA export em try/catch com fallback RSACryptoServiceProvider
2. **`public/agent-scripts/cybershield-agent-windows-v5.ps1`** — Mirror da mesma correção
3. **`supabase/functions/_shared/windows-script-hotfix.ts`** — Novo hotfix para scripts em campo

