# Configuração da API VirusTotal

## Sobre o VirusTotal

VirusTotal é um serviço gratuito que analisa arquivos e URLs suspeitas para detectar malware usando múltiplos antivírus e scanners.

## Plano Gratuito

- **500 requisições por dia**
- **4 requisições por minuto**
- Acesso à API v2
- Análise de arquivos e URLs
- Consulta de hash de arquivos

## Obter API Key

### 1. Criar Conta
1. Acesse [https://www.virustotal.com/gui/join-us](https://www.virustotal.com/gui/join-us)
2. Registre-se com email
3. Confirme seu email

### 2. Obter API Key
1. Faça login em [https://www.virustotal.com/](https://www.virustotal.com/)
2. Clique no seu perfil (canto superior direito)
3. Vá para "API Key"
4. Copie sua API Key

### 3. Adicionar ao CyberShield

Você precisa adicionar a API Key como secret no Lovable Cloud:

1. No projeto Lovable, vá para **Settings → Secrets**
2. Clique em **Add Secret**
3. Nome: `VIRUSTOTAL_API_KEY`
4. Valor: Cole sua API Key do VirusTotal
5. Salve

## Uso da API

### Endpoint Implementado: `scan-virus`

**Requisição:**
```bash
POST /functions/v1/scan-virus
Headers:
  X-Agent-Token: <agent_token>
  X-HMAC-Signature: <hmac_signature>
  X-Timestamp: <timestamp>
  X-Nonce: <nonce>
Body:
{
  "filePath": "/path/to/file.exe",
  "fileHash": "sha256_hash_here"
}
```

**Resposta (Malicioso):**
```json
{
  "isMalicious": true,
  "positives": 45,
  "totalScans": 70,
  "permalink": "https://www.virustotal.com/gui/file/...",
  "scanDate": "2025-11-05 12:00:00",
  "scans": {
    "Avast": { "detected": true, "result": "Win32:Malware-gen" },
    "Kaspersky": { "detected": true, "result": "Trojan.Win32.Agent" }
  }
}
```

**Resposta (Limpo):**
```json
{
  "isMalicious": false,
  "positives": 0,
  "totalScans": 70,
  "permalink": "https://www.virustotal.com/gui/file/...",
  "scanDate": "2025-11-05 12:00:00"
}
```

**Resposta (Arquivo não encontrado):**
```json
{
  "error": "Arquivo não encontrado no VirusTotal",
  "message": "Envie o arquivo para análise primeiro"
}
```

**Resposta (Cache):**
Se o hash já foi escaneado nas últimas 24h:
```json
{
  "cached": true,
  "isMalicious": false,
  "positives": 0,
  "totalScans": 70,
  "permalink": "https://...",
  "scannedAt": "2025-11-05T10:30:00Z"
}
```

## Rate Limiting

O endpoint `scan-virus` tem rate limiting próprio:
- **10 requisições por minuto** por agente
- **Bloqueio de 5 minutos** se exceder

Além disso, o VirusTotal tem limites:
- **4 requisições por minuto**
- **500 requisições por dia**

## Exemplos de Uso

### PowerShell (Windows)
```powershell
# Escanear arquivo
$filePath = "C:\suspeito.exe"
$fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()

$body = @{
    filePath = $filePath
    fileHash = $fileHash
} | ConvertTo-Json

# Configurar headers HMAC (veja script completo)
$result = Invoke-RestMethod `
    -Uri "https://seu-servidor.com/functions/v1/scan-virus" `
    -Method POST `
    -Headers $headers `
    -Body $body

if ($result.isMalicious) {
    Write-Host "MALWARE DETECTADO!"
    Write-Host "Detecções: $($result.positives)/$($result.totalScans)"
}
```

### Bash (Linux)
```bash
# Escanear arquivo
file_path="/tmp/suspicious.bin"
file_hash=$(sha256sum "$file_path" | awk '{print $1}')

# Fazer requisição (veja script completo para HMAC)
result=$(curl -s -X POST \
    "https://seu-servidor.com/functions/v1/scan-virus" \
    -H "X-Agent-Token: $AGENT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"filePath\":\"$file_path\",\"fileHash\":\"$file_hash\"}")

if echo "$result" | grep -q '"isMalicious":true'; then
    echo "MALWARE DETECTADO!"
fi
```

## Integração no Dashboard

Os resultados dos scans ficam salvos na tabela `virus_scans` e podem ser visualizados no dashboard:

- Total de arquivos escaneados
- Arquivos maliciosos detectados
- Taxa de detecção
- Últimos scans por agente

## Alternativas Gratuitas

Se precisar de mais requisições ou funcionalidades:

1. **Hybrid Analysis** (https://www.hybrid-analysis.com/)
   - 200 scans/dia gratuitos
   - Análise comportamental

2. **URLScan.io** (https://urlscan.io/)
   - Para URLs e domínios
   - Gratuito sem limite

3. **MetaDefender** (https://metadefender.opswat.com/)
   - API gratuita limitada
   - Múltiplos engines

4. **MalwareBazaar** (https://bazaar.abuse.ch/)
   - Base de dados de malware
   - Gratuito e open source

## Boas Práticas

1. **Cache Local**: O sistema já implementa cache de 24h para evitar scans duplicados
2. **Rate Limiting**: Respeite os limites da API para evitar bloqueio
3. **Scan Seletivo**: Escaneie apenas arquivos suspeitos, não todos os arquivos
4. **Priorização**: Priorize arquivos executáveis (.exe, .dll, .bin, etc.)
5. **Backup**: Mantenha backup da API Key

## Troubleshooting

### Erro 403 (Forbidden)
- Verifique se a API Key está correta
- Confirme que a API Key está ativa no VirusTotal

### Erro 204 (No Content)
- Requisição válida mas sem conteúdo
- Arquivo não encontrado no banco de dados do VirusTotal

### Erro 429 (Too Many Requests)
- Rate limit do VirusTotal excedido
- Aguarde alguns minutos antes de tentar novamente

### Erro 400 (Bad Request)
- Formato do hash inválido
- Hash deve ser SHA256 em lowercase

## Referências

- [VirusTotal API Documentation](https://developers.virustotal.com/reference/overview)
- [VirusTotal Community Guidelines](https://support.virustotal.com/hc/en-us/articles/115002145529-Terms-of-Service)
- [File Hash Calculator](https://emn178.github.io/online-tools/sha256_checksum.html)
