# Guia de Testes: Telemetria de Erros PowerShell

## Objetivo

Validar que o instalador Windows captura e envia corretamente todos os erros de instalação para o backend, permitindo observabilidade completa do processo de instalação.

## Pré-requisitos

- Acesso ao dashboard admin do CyberShield
- Máquina Windows 10/11 ou Windows Server 2016+
- PowerShell 5.1+
- Privilégios de administrador

## Cenários de Teste

### Teste 1: Erro 401 - Token Inválido

**Objetivo**: Validar captura de erro de autenticação

**Passos**:
1. Gerar instalador no dashboard com nome válido
2. Baixar o arquivo `.ps1`
3. Editar o arquivo e modificar `$AgentToken` para um valor inválido (ex: adicionar "X" no final)
4. Executar o instalador como administrador
5. Aguardar o erro aparecer

**Resultado Esperado**:
- ✅ Instalador exibe: "ERRO DURANTE A INSTALAÇÃO"
- ✅ Tipo de erro detectado: `http_401_unauthorized`
- ✅ Mensagem: "Enviando telemetria de erro ao backend..."
- ✅ Confirmação: "✓ Telemetria de erro enviada"
- ✅ No dashboard (`Installation Logs Explorer`):
  - Evento com `success = false`
  - `error_type = "http_401_unauthorized"`
  - `error_message` contém "401" ou "Unauthorized"
  - `installation_logs.stderr` contém stack trace

**Validação SQL**:
```sql
SELECT 
  agent_name,
  event_type,
  success,
  error_message,
  metadata->'errors'->>'type' as error_type,
  metadata->'system_info'->>'os_version' as os_version,
  created_at
FROM installation_analytics
WHERE success = false
  AND metadata->'errors'->>'type' = 'http_401_unauthorized'
ORDER BY created_at DESC
LIMIT 1;
```

---

### Teste 2: Erro de TLS/SSL

**Objetivo**: Validar captura de erro de certificado/TLS

**Passos**:
1. Em uma VM Windows Server 2012 R2 (ou desabilitar TLS 1.2 manualmente):
   ```powershell
   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls
   ```
2. Executar instalador
3. Aguardar erro de TLS

**Resultado Esperado**:
- ✅ Tipo de erro: `tls_ssl_error`
- ✅ Mensagem de erro contém "TLS", "SSL" ou "secure channel"
- ✅ Telemetria enviada com stack trace

**Validação Dashboard**:
- Buscar por `error_type = "tls_ssl_error"` em `Installation Logs Explorer`
- Validar que `metadata.system_info.tls_enabled = false`

---

### Teste 3: Erro de Proxy

**Objetivo**: Validar captura de erro de proxy corporativo

**Passos**:
1. Configurar proxy inválido no Windows:
   ```powershell
   netsh winhttp set proxy proxy-server="invalid-proxy:8080"
   ```
2. Executar instalador
3. Aguardar erro de conexão

**Resultado Esperado**:
- ✅ Tipo de erro: `proxy_error` ou `network_timeout`
- ✅ Telemetria contém `network_tests.proxy_detected = true` (ou erro antes disso)
- ✅ Stack trace capturado

**Limpeza**:
```powershell
netsh winhttp reset proxy
```

---

### Teste 4: Erro de Expressão Nula

**Objetivo**: Validar captura de erro interno do PowerShell

**Passos**:
1. Editar instalador e injetar código com erro intencional:
   ```powershell
   # Adicionar após linha 180 (após health check)
   $null.ToString()
   ```
2. Executar instalador

**Resultado Esperado**:
- ✅ Tipo de erro: `null_reference_error`
- ✅ Mensagem: "Cannot call a method on a null-valued expression"
- ✅ Stack trace mostra linha exata do erro

---

### Teste 5: Erro de Permissão

**Objetivo**: Validar captura de erro de acesso negado

**Passos**:
1. Executar instalador SEM privilégios de administrador
2. Aguardar erro

**Resultado Esperado**:
- ✅ Erro capturado antes do bloco try principal (validação de admin)
- ✅ Mensagem: "Este script requer privilégios de administrador"
- ✅ Script não continua (exit 1 antes do try)

**Nota**: Este erro não envia telemetria pois ocorre antes da configuração das funções.

---

### Teste 6: Timeout de Rede

**Objetivo**: Validar captura de timeout

**Passos**:
1. Bloquear firewall de saída para domínio do backend:
   ```powershell
   New-NetFirewallRule -DisplayName "Block CyberShield" `
     -Direction Outbound -Action Block `
     -RemoteAddress "iavbnmduxpxhwubqrzzn.supabase.co"
   ```
2. Executar instalador
3. Aguardar timeout (5-10s)

**Resultado Esperado**:
- ✅ Tipo de erro: `network_timeout`
- ✅ Mensagem contém "timeout" ou "timed out"
- ⚠️ Telemetria NÃO será enviada (pois backend está bloqueado)
- ✅ Log local em `C:\CyberShield\logs\install.log` contém erro

**Limpeza**:
```powershell
Remove-NetFirewallRule -DisplayName "Block CyberShield"
```

---

### Teste 7: Erro de DNS

**Objetivo**: Validar captura de erro de resolução DNS

**Passos**:
1. Modificar hosts file para DNS inválido:
   ```
   # C:\Windows\System32\drivers\etc\hosts
   127.0.0.1  iavbnmduxpxhwubqrzzn.supabase.co
   ```
2. Executar instalador

**Resultado Esperado**:
- ✅ Tipo de erro: `dns_resolution_error` ou `network_timeout`
- ✅ Health check falha
- ✅ Erro capturado com stack trace

**Limpeza**: Remover linha do hosts file

---

## Validação End-to-End

### Dashboard: Installation Logs Explorer

**Filtros para aplicar**:
1. **Por tipo de erro**:
   - `error_type = "http_401_unauthorized"` → Ver todos os 401
   - `error_type = "tls_ssl_error"` → Ver erros de TLS
   - `error_type = "null_reference_error"` → Ver erros de código

2. **Por sucesso/falha**:
   - `success = false` → Ver todas as falhas
   - `success = true` → Ver instalações bem-sucedidas

3. **Por plataforma**:
   - `platform = "windows"` → Filtrar apenas Windows

**Validação de Dados**:
- ✅ Campo `error_message` está populado
- ✅ Campo `metadata.errors.type` corresponde ao erro detectado
- ✅ Campo `metadata.errors.stack` contém stack trace completo
- ✅ Campo `metadata.system_info.powershell_version` está preenchido
- ✅ Campo `metadata.system_info.os_version` está preenchido
- ✅ Campo `metadata.installation_logs.stderr` contém output do erro

### SQL: Análise de Taxa de Erros

```sql
-- Taxa de falhas por tipo de erro (últimas 24h)
SELECT 
  metadata->'errors'->>'type' as error_type,
  COUNT(*) as occurrences,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM installation_analytics
WHERE success = false
  AND created_at > NOW() - INTERVAL '24 hours'
  AND event_type IN ('post_installation', 'post_installation_unverified')
GROUP BY error_type
ORDER BY occurrences DESC;
```

**Saída Esperada** (após todos os testes):
```
error_type               | occurrences | percentage
-------------------------+-------------+-----------
http_401_unauthorized    | 3           | 37.50
tls_ssl_error           | 2           | 25.00
null_reference_error    | 1           | 12.50
network_timeout         | 1           | 12.50
dns_resolution_error    | 1           | 12.50
```

---

## Critérios de Sucesso

✅ **Fase 1.1 - Telemetria de Erros PowerShell COMPLETA**:

1. ✅ Função `Send-ErrorTelemetry` implementada
2. ✅ Função `Get-ErrorType` implementada com 12+ tipos de erro
3. ✅ Bloco `catch` principal chama `Send-ErrorTelemetry`
4. ✅ Edge Function `post-installation-telemetry` aceita `success=false`
5. ✅ Todos os 7 cenários de teste passam
6. ✅ Dashboard `Installation Logs Explorer` exibe erros corretamente
7. ✅ Filtros por `error_type` funcionam
8. ✅ Stack traces são capturados e exibidos
9. ✅ Logs locais em `C:\CyberShield\logs\install.log` contêm histórico completo

---

## Troubleshooting

### Telemetria não está sendo enviada

**Causa**: Firewall ou proxy bloqueando
**Solução**: Verificar logs em `C:\CyberShield\logs\install.log`

### Erro não aparece no dashboard

**Causa**: Token inválido impede gravação
**Solução**: Verificar `installation_analytics` com query SQL direta:
```sql
SELECT * FROM installation_analytics 
WHERE event_type = 'post_installation_unverified' 
ORDER BY created_at DESC LIMIT 10;
```

### Stack trace incompleto

**Causa**: Erro ocorre antes da função ser definida
**Solução**: Mover funções para o topo do script (antes do try principal)

---

## Próximos Passos

Após validar Fase 1.1:
- **Fase 1.2**: Índices de performance SQL
- **Fase 1.3**: Validação de input Edge Functions
- **Fase 2**: Melhorias de UX (ErrorState component)
- **Fase 3**: Alertas de taxa de falha alta
- **Fase 4**: Testes E2E automatizados

---

## Referências

- `public/templates/install-windows-template.ps1` - Instalador principal
- `public/templates/install-windows-fixed.ps1` - Instalador simplificado
- `supabase/functions/post-installation-telemetry/index.ts` - Edge Function
- `docs/DATA_FLOW_ARCHITECTURE.md` - Arquitetura de dados
- `docs/DASHBOARD_USER_GUIDE.md` - Guia de dashboards
