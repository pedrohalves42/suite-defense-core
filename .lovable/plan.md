

## Diagnóstico — Por que o comando de reinstalação falha

Validei o servidor e ele está **100% funcional**:
- `GET /functions/v1/get-latest-agent-script?platform=windows&format=plain` → HTTP 200, ~183 KB
- O conteúdo retornado satisfaz todos os 7 checks do validador (`param(`, `Initialize-Config`, `Main`, `Start-HeartbeatLoop`, `Invoke-SecureRequest`, sem HTML, > 5000 bytes)
- `verify_jwt = false` está corretamente configurado em `supabase/config.toml:743`

Logo, **o problema está no comando PowerShell gerado pelo frontend** (`src/lib/agentReinstallCommand.ts`). Identifiquei 5 bugs reais que explicam por que máquinas em produção falham:

---

### Bug 1 — `Invoke-RestMethod` quebra StrictMode no agente (CRÍTICO)
`Invoke-RestMethod` com `Content-Type: text/plain` retorna **uma única string sem newlines preservados em alguns hosts** quando há proxy/compressão intermediária. Pior: em PS 5.1, IRM com text/plain às vezes retorna `[byte[]]` ou um objeto `BasicHtmlWebResponseObject`. O bloco `[string]$content` então recebe a representação `.ToString()` ("System.Byte[]") e a validação falha silenciosamente com "Conteudo invalido (Invoke-RestMethod)".  
**Correção:** usar **somente** `Invoke-WebRequest -UseBasicParsing` (já tratamos `text/plain` como binário-seguro) e ler `[Text.Encoding]::UTF8.GetString($resp.Content)`.

### Bug 2 — Cabeçalho `User-Agent` ausente (CRÍTICO em redes corporativas)
Cloudflare na frente do Supabase às vezes retorna **challenge HTML** (JS Challenge / Bot Fight) quando o User-Agent é o default do PowerShell (`Mozilla/5.0 (Windows NT; Windows NT 10.0; pt-BR) WindowsPowerShell/5.1.x`). O agente recebe HTML, dispara `<html` regex, e devolve "Conteudo invalido". Isso é exatamente o sintoma reportado em redes com firewalls que rotulam PowerShell como suspeito.  
**Correção:** enviar `-Headers @{ 'User-Agent' = 'CyberShield-Reinstaller/6.0'; 'Accept' = 'text/plain' }`.

### Bug 3 — Fallback URL inválido (MAJOR)
`fallbackServerUrl = https://affc1ab5-...lovableproject.com` **não expõe `/functions/v1/`**. Quando o Supabase falha, o fallback retorna a SPA (HTML), `<html` matcher rejeita, e o usuário recebe a mensagem genérica de "servidor não retornou script PowerShell válido" — escondendo o erro real do primeiro host.  
**Correção:** remover o fallback para `lovableproject.com` (manter apenas Supabase) **ou** apontar o fallback para o domínio publicado real (`https://cybshield-audit.lovable.app/functions/v1/...` se tiver Edge Functions roteadas; caso contrário, suprimir).

### Bug 4 — `Get-Random` na URL não derrota cache do CF agressivo (MENOR mas relevante)
`?cb=$(Get-Random)` adiciona query, mas Cloudflare por padrão ignora querystring no cache de `/functions/v1/`. Quando uma versão corrompida é cacheada na borda, a reinstalação em massa nunca se recupera.  
**Correção:** adicionar header `Cache-Control: no-cache` e `Pragma: no-cache` na requisição.

### Bug 5 — Falta de logging do tamanho/início do conteúdo recebido (DIAGNÓSTICO)
Hoje a mensagem "Conteudo invalido em <url>" não diz **por que** falhou (qual dos 7 checks reprovou). Operadores não conseguem diagnosticar.  
**Correção:** quando a validação falha, imprimir tamanho, primeiros 200 chars, e qual check falhou.

---

### Bug bônus 6 — Race condition do Scheduled Task
`Start-Sleep -Seconds 2` antes de ler `Get-ScheduledTaskInfo` é insuficiente. O agente leva ~10–20s para o primeiro heartbeat. Aumentar para 15s e fazer polling do `LastTaskResult`.

---

## Plano de implementação

**Arquivo único a modificar:** `src/lib/agentReinstallCommand.ts`

1. **Remover** o branch `Invoke-RestMethod` por completo. Usar apenas `Invoke-WebRequest -UseBasicParsing` com headers explícitos:
   ```powershell
   $headers = @{
     'User-Agent'    = 'CyberShield-Reinstaller/6.0'
     'Accept'        = 'text/plain, text/x-powershell, */*'
     'Cache-Control' = 'no-cache'
     'Pragma'        = 'no-cache'
   }
   $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -Headers $headers -ErrorAction Stop
   $bytes = $resp.Content
   if ($bytes -is [byte[]]) {
     $plain = [System.Text.Encoding]::UTF8.GetString($bytes)
   } else {
     $plain = [string]$bytes
   }
   ```

2. **Refatorar `$isValidScript`** para retornar `[pscustomobject]@{ Ok = $bool; Reason = $string }` e logar o motivo no console.

3. **Eliminar fallback URL inválido**. Manter `$baseUrls = @($serverUrl)` (apenas Supabase). Se o usuário insistir em fallback, usar apenas se for um domínio que comprovadamente roteia `/functions/v1/`.

4. **Aumentar diagnóstico final**: imprimir `Length`, primeiros 120 chars do conteúdo recebido sempre que a validação reprovar, e o `StatusCode`/`StatusDescription` da resposta.

5. **Hardening do post-install**: trocar `Start-Sleep -Seconds 2` por loop de até 30s aguardando `$taskInfo.LastTaskResult -ne $null`.

6. **TLS:** adicionar `Tls13` ao `SecurityProtocol` quando disponível:
   ```powershell
   try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 } catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }
   ```

7. **Sem mudanças no backend** — o servidor já está funcional e validado.

## Detalhes técnicos

- O comando final muda de ~6.5 KB para ~7.2 KB (cabe folgado em linha única do PowerShell).
- A interface `BuildAgentReinstallCommandParams` mantém a mesma assinatura — `AgentReinstallCommand.tsx` e `MassReinstall` consomem sem mudança.
- Build/CI: nenhum teste existente em `agentReinstallCommand.ts`. Posso adicionar um teste unitário verificando que o comando contém os novos headers e ausência de `Invoke-RestMethod`.

## Resultado esperado

- Máquinas atrás de Cloudflare/firewall corporativo passam a baixar o script (User-Agent legítimo).
- Falhas mostram **a causa real** (HTML challenge, tamanho 0, regex X falhou) em vez de mensagem genérica.
- Tempo de diagnóstico cai de "horas" para "segundos".

