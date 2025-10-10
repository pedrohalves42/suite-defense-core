# Guia Completo de Instalação - CyberShield

**Domínio Oficial:** suite-defense-core.lovable.app

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Requisitos do Sistema](#requisitos-do-sistema)
3. [Instalação do Servidor](#instalação-do-servidor)
4. [Instalação do Agente](#instalação-do-agente)
5. [Configuração Avançada](#configuração-avançada)
6. [Solução de Problemas](#solução-de-problemas)
7. [Distribuição e Empacotamento](#distribuição-e-empacotamento)

---

## 🎯 Visão Geral

O CyberShield é um sistema de segurança distribuído composto por:

- **Servidor Central**: Dashboard web para gerenciamento e monitoramento
- **Agentes**: Clientes instalados em estações para coleta de dados e execução de tarefas

### Arquitetura

```
┌─────────────────┐
│  Servidor Web   │ ← Dashboard e API
│   (Port 8080)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│Agent 1│ │Agent 2│ ... → Estações monitoradas
└───────┘ └───────┘
```

---

## 💻 Requisitos do Sistema

### Servidor Central

**Windows:**
- Windows Server 2016+ ou Windows 10/11
- 4GB RAM mínimo (8GB recomendado)
- 50GB espaço em disco
- Node.js 18+ (instalado automaticamente)
- PowerShell 5.1+

**Linux:**
- Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+
- 4GB RAM mínimo (8GB recomendado)
- 50GB espaço em disco
- Node.js 18+ (instalado automaticamente)
- systemd

### Agente

**Windows:**
- Windows 7+ (64-bit)
- 2GB RAM mínimo
- 1GB espaço em disco
- PowerShell 5.1+
- Windows Defender (para funcionalidades de antivírus)

**Linux:**
- Ubuntu 18.04+, Debian 10+, CentOS 7+
- 1GB RAM mínimo
- 1GB espaço em disco
- systemd
- ClamAV (opcional, para funcionalidades de antivírus)

---

## 🖥️ Instalação do Servidor

### Método 1: Instalador Web (Recomendado)

1. **Acesse o instalador web:**
   ```
   https://[seu-dominio]/agent-installer
   ```

2. **Selecione "Servidor Central"**

3. **Escolha sua plataforma** (Windows/Linux)

4. **Baixe o script de instalação**

5. **Execute o script:**

   **Windows (como Administrador):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File install-server.ps1
   ```

   **Linux (como root):**
   ```bash
   sudo bash install-server.sh
   ```

### Método 2: Instalação Manual

#### Windows

1. **Criar estrutura de diretórios:**
   ```powershell
   New-Item -ItemType Directory -Force -Path "C:\Program Files\CyberShield\Server"
   New-Item -ItemType Directory -Force -Path "C:\Program Files\CyberShield\Server\logs"
   New-Item -ItemType Directory -Force -Path "C:\Program Files\CyberShield\Server\database"
   New-Item -ItemType Directory -Force -Path "C:\Program Files\CyberShield\Server\reports"
   ```

2. **Instalar Node.js:**
   - Download: https://nodejs.org/
   - Versão LTS recomendada

3. **Criar arquivo de configuração** (`config.json`):
   ```json
   {
     "serverName": "CyberShield-Server",
     "serverUrl": "https://[seu-supabase-url]",
     "port": 8080,
     "tenantId": "production",
     "apiEndpoints": {
       "enrollAgent": "https://[seu-supabase-url]/functions/v1/enroll-agent",
       "createJob": "https://[seu-supabase-url]/functions/v1/create-job",
       "listReports": "https://[seu-supabase-url]/functions/v1/list-reports",
       "healthCheck": "https://[seu-supabase-url]/functions/v1/health-check"
     },
     "logLevel": "info",
     "maxLogSize": "100MB",
     "reportRetentionDays": 90
   }
   ```

4. **Instalar como serviço do Windows:**
   ```powershell
   New-Service -Name "CyberShieldServer" `
     -BinaryPathName "powershell.exe -ExecutionPolicy Bypass -File 'C:\Program Files\CyberShield\Server\start-server.ps1'" `
     -DisplayName "CyberShield Security Server" `
     -StartupType Automatic
   
   Start-Service -Name "CyberShieldServer"
   ```

#### Linux

1. **Criar estrutura de diretórios:**
   ```bash
   sudo mkdir -p /opt/cybershield/server/{logs,database,reports}
   ```

2. **Instalar Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Criar arquivo de configuração** (`/opt/cybershield/server/config.json`):
   ```json
   {
     "serverName": "CyberShield-Server",
     "serverUrl": "https://[seu-supabase-url]",
     "port": 8080,
     "tenantId": "production",
     "apiEndpoints": {
       "enrollAgent": "https://[seu-supabase-url]/functions/v1/enroll-agent",
       "createJob": "https://[seu-supabase-url]/functions/v1/create-job",
       "listReports": "https://[seu-supabase-url]/functions/v1/list-reports",
       "healthCheck": "https://[seu-supabase-url]/functions/v1/health-check"
     },
     "logLevel": "info",
     "maxLogSize": "100MB",
     "reportRetentionDays": 90
   }
   ```

4. **Criar serviço systemd** (`/etc/systemd/system/cybershield-server.service`):
   ```ini
   [Unit]
   Description=CyberShield Security Server
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/cybershield/server
   ExecStart=/opt/cybershield/server/start-server.sh
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

5. **Ativar e iniciar serviço:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable cybershield-server
   sudo systemctl start cybershield-server
   ```

### Verificação da Instalação

1. **Verifique se o servidor está rodando:**
   
   **Windows:**
   ```powershell
   Get-Service CyberShieldServer
   ```

   **Linux:**
   ```bash
   sudo systemctl status cybershield-server
   ```

2. **Acesse o dashboard:**
   ```
   http://localhost:8080/server
   ```

3. **Verifique os logs:**
   
   **Windows:**
   ```powershell
   Get-Content "C:\Program Files\CyberShield\Server\logs\*.log" -Tail 50
   ```

   **Linux:**
   ```bash
   sudo journalctl -u cybershield-server -n 50
   ```

---

## 🔧 Instalação do Agente

### Passo 1: Gerar Token de Agente

1. **Acesse o instalador web:**
   ```
   https://[seu-dominio]/agent-installer
   ```

2. **Selecione "Agente de Monitoramento"**

3. **Configure:**
   - Nome do Agente (ex: AGENT-WORKSTATION-01)
   - Tenant ID (ex: production)
   - Plataforma (Windows/Linux)

4. **Clique em "Gerar Token"** e copie o token gerado

### Passo 2: Instalar o Agente

#### Windows

1. **Baixe o script de instalação**

2. **Edite o script** (se não usou o instalador web):
   - Substitua `SEU_TOKEN_AQUI` pelo token gerado
   - Ajuste `$AgentName` se necessário

3. **Execute como Administrador:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File install-agent-[nome].ps1
   ```

4. **Instale como serviço:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Program Files\CyberShield\Agent\install-service.ps1"
   ```

5. **Verifique o status:**
   ```powershell
   Get-Service CyberShieldAgent
   ```

#### Linux

1. **Baixe o script de instalação**

2. **Edite o script** (se não usou o instalador web):
   - Substitua `SEU_TOKEN_AQUI` pelo token gerado
   - Ajuste `AGENT_NAME` se necessário

3. **Torne o script executável:**
   ```bash
   chmod +x install-agent-[nome].sh
   ```

4. **Execute como root:**
   ```bash
   sudo ./install-agent-[nome].sh
   ```

5. **Inicie o serviço:**
   ```bash
   sudo systemctl start cybershield-agent
   ```

6. **Verifique o status:**
   ```bash
   sudo systemctl status cybershield-agent
   ```

### Funcionalidades do Agente

O agente instalado possui as seguintes capacidades:

- ✅ **Varredura de Antivírus**: Integração com Windows Defender (Windows) ou ClamAV (Linux)
- ✅ **Monitoramento de Firewall**: Verifica status e regras ativas
- ✅ **Análise de Processos**: Lista processos em execução com uso de CPU/memória
- ✅ **Monitoramento de Rede**: Monitora conexões estabelecidas
- ✅ **Heartbeat Automático**: Envia status a cada 60 segundos
- ✅ **Execução de Jobs Remotos**: Recebe e executa comandos do servidor
- ✅ **Logs Detalhados**: Registro de todas as atividades

---

## ⚙️ Configuração Avançada

### Configuração do Servidor

Arquivo: `config.json`

```json
{
  "serverName": "CyberShield-Server",
  "serverUrl": "https://[seu-supabase-url]",
  "port": 8080,
  "tenantId": "production",
  "apiEndpoints": {
    "enrollAgent": "https://[seu-supabase-url]/functions/v1/enroll-agent",
    "createJob": "https://[seu-supabase-url]/functions/v1/create-job",
    "listReports": "https://[seu-supabase-url]/functions/v1/list-reports",
    "healthCheck": "https://[seu-supabase-url]/functions/v1/health-check"
  },
  "logLevel": "debug",           // info, warn, error, debug
  "maxLogSize": "100MB",
  "reportRetentionDays": 90,
  "ssl": {                        // Opcional: configuração SSL
    "enabled": true,
    "certPath": "/path/to/cert.pem",
    "keyPath": "/path/to/key.pem"
  },
  "authentication": {             // Opcional: autenticação adicional
    "enabled": true,
    "apiKey": "your-secret-key"
  }
}
```

### Configuração do Agente

Arquivo: `config.json`

```json
{
  "agentName": "AGENT-01",
  "agentToken": "token-aqui",
  "serverUrl": "https://[seu-supabase-url]",
  "pollInterval": 30,             // Intervalo de polling em segundos
  "heartbeatInterval": 60,        // Intervalo de heartbeat em segundos
  "features": {
    "antivirus": true,            // Ativar/desativar funcionalidades
    "firewall": true,
    "systemScan": true,
    "networkMonitor": true,
    "processMonitor": true
  },
  "scanSettings": {
    "quickScanPaths": [           // Caminhos para scan rápido
      "C:\\Users",
      "C:\\Program Files"
    ],
    "excludePaths": [             // Caminhos excluídos
      "C:\\Windows\\System32"
    ]
  },
  "networkSettings": {
    "monitorPorts": [              // Portas a monitorar
      80, 443, 22, 3389
    ],
    "alertOnNewConnection": true
  }
}
```

### Variáveis de Ambiente

**Servidor:**
```bash
CYBERSHIELD_PORT=8080
CYBERSHIELD_LOG_LEVEL=info
CYBERSHIELD_TENANT_ID=production
```

**Agente:**
```bash
CYBERSHIELD_AGENT_NAME=AGENT-01
CYBERSHIELD_POLL_INTERVAL=30
CYBERSHIELD_DEBUG=false
```

---

## 🔍 Solução de Problemas

### Servidor

#### Problema: Servidor não inicia

**Sintomas:**
- Serviço falha ao iniciar
- Erro "Port already in use"

**Soluções:**

1. **Verificar se a porta está em uso:**
   ```powershell
   # Windows
   netstat -ano | findstr :8080
   
   # Linux
   sudo netstat -tulpn | grep :8080
   ```

2. **Alterar porta no config.json**

3. **Verificar permissões:**
   ```bash
   # Linux
   sudo chown -R root:root /opt/cybershield/server
   sudo chmod -R 755 /opt/cybershield/server
   ```

#### Problema: Erro de conexão com banco de dados

**Sintomas:**
- Logs mostram "Connection refused"
- Dashboard não carrega dados

**Soluções:**

1. **Verificar URL do Supabase** no `config.json`

2. **Testar conectividade:**
   ```bash
   curl -I https://[seu-supabase-url]
   ```

3. **Verificar firewall:**
   ```powershell
   # Windows
   New-NetFirewallRule -DisplayName "CyberShield Server" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
   
   # Linux
   sudo ufw allow 8080/tcp
   ```

### Agente

#### Problema: Agente não se conecta ao servidor

**Sintomas:**
- Logs mostram "Failed to connect"
- Agente não aparece no dashboard

**Soluções:**

1. **Verificar token de agente:**
   - Token correto no `config.json`?
   - Token ainda válido?

2. **Verificar conectividade:**
   ```bash
   curl -H "X-Agent-Token: [seu-token]" https://[seu-supabase-url]/functions/v1/poll-jobs
   ```

3. **Verificar logs:**
   ```powershell
   # Windows
   Get-Content "C:\Program Files\CyberShield\Agent\logs\agent_*.log" -Tail 50
   
   # Linux
   sudo journalctl -u cybershield-agent -n 50
   ```

#### Problema: Scan de antivírus falha

**Sintomas:**
- Erro "Antivirus not found"
- Scan retorna vazio

**Soluções:**

1. **Windows: Verificar Windows Defender:**
   ```powershell
   Get-MpComputerStatus
   ```

2. **Linux: Instalar ClamAV:**
   ```bash
   sudo apt-get update
   sudo apt-get install clamav clamav-daemon
   sudo freshclam
   ```

### Logs e Diagnóstico

**Aumentar nível de log:**

1. **Editar `config.json`:**
   ```json
   {
     "logLevel": "debug"
   }
   ```

2. **Reiniciar serviço:**
   ```bash
   # Windows
   Restart-Service CyberShieldAgent
   
   # Linux
   sudo systemctl restart cybershield-agent
   ```

**Coletar logs para suporte:**

```powershell
# Windows
Compress-Archive -Path "C:\Program Files\CyberShield\*\logs\*" -DestinationPath "C:\cybershield-logs.zip"

# Linux
sudo tar -czf /tmp/cybershield-logs.tar.gz /opt/cybershield/*/logs/
```

---

## 📦 Distribuição e Empacotamento

### Criar Executável Windows (.exe)

#### Método 1: ps2exe (Recomendado para scripts simples)

1. **Instalar ps2exe:**
   ```powershell
   Install-Module -Name ps2exe
   ```

2. **Converter script:**
   ```powershell
   ps2exe -inputFile install-server.ps1 -outputFile CyberShield-Server-Installer.exe -iconFile icon.ico
   ```

#### Método 2: Inno Setup (Instalador profissional)

1. **Baixar Inno Setup:** https://jrsoftware.org/isdl.php

2. **Criar script de instalação** (`installer.iss`):
   ```ini
   [Setup]
   AppName=CyberShield Server
   AppVersion=1.0.0
   DefaultDirName={pf}\CyberShield\Server
   
   [Files]
   Source: "install-server.ps1"; DestDir: "{app}"
   Source: "config.json"; DestDir: "{app}"
   
   [Run]
   Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-server.ps1"""
   ```

3. **Compilar:**
   ```
   ISCC.exe installer.iss
   ```

#### Método 3: NSIS (Open Source)

1. **Baixar NSIS:** https://nsis.sourceforge.io/

2. **Criar script** (`installer.nsi`):
   ```nsis
   OutFile "CyberShield-Setup.exe"
   InstallDir "$PROGRAMFILES\CyberShield\Server"
   
   Section "Install"
     SetOutPath $INSTDIR
     File "install-server.ps1"
     File "config.json"
     ExecWait 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\install-server.ps1"'
   SectionEnd
   ```

3. **Compilar:**
   ```
   makensis installer.nsi
   ```

### Criar Pacote Linux (.deb/.rpm)

#### Método 1: fpm (Effing Package Management)

1. **Instalar fpm:**
   ```bash
   sudo apt-get install ruby ruby-dev rubygems build-essential
   sudo gem install fpm
   ```

2. **Criar estrutura de pacote:**
   ```bash
   mkdir -p package/opt/cybershield/server
   cp install-server.sh package/opt/cybershield/server/
   cp config.json package/opt/cybershield/server/
   ```

3. **Criar pacote .deb:**
   ```bash
   fpm -s dir -t deb \
     -n cybershield-server \
     -v 1.0.0 \
     --description "CyberShield Security Server" \
     --depends nodejs \
     --after-install postinstall.sh \
     -C package .
   ```

4. **Criar pacote .rpm:**
   ```bash
   fpm -s dir -t rpm \
     -n cybershield-server \
     -v 1.0.0 \
     --description "CyberShield Security Server" \
     --depends nodejs \
     --after-install postinstall.sh \
     -C package .
   ```

#### Método 2: dpkg-deb (Debian/Ubuntu)

1. **Criar estrutura:**
   ```bash
   mkdir -p cybershield-server_1.0.0/DEBIAN
   mkdir -p cybershield-server_1.0.0/opt/cybershield/server
   ```

2. **Criar arquivo control:**
   ```
   Package: cybershield-server
   Version: 1.0.0
   Architecture: all
   Maintainer: Seu Nome <email@exemplo.com>
   Depends: nodejs (>= 18)
   Description: CyberShield Security Server
   ```

3. **Criar pacote:**
   ```bash
   dpkg-deb --build cybershield-server_1.0.0
   ```

### Distribuição via Web

#### Servidor de Download Simples

1. **Criar página de download** (`download.html`):
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <title>CyberShield - Download</title>
   </head>
   <body>
     <h1>Download CyberShield</h1>
     
     <h2>Servidor</h2>
     <ul>
       <li><a href="/downloads/CyberShield-Server-Windows.exe">Windows (.exe)</a></li>
       <li><a href="/downloads/cybershield-server_1.0.0_amd64.deb">Linux (.deb)</a></li>
       <li><a href="/downloads/cybershield-server-1.0.0-1.x86_64.rpm">Linux (.rpm)</a></li>
     </ul>
     
     <h2>Agente</h2>
     <ul>
       <li><a href="/downloads/CyberShield-Agent-Windows.exe">Windows (.exe)</a></li>
       <li><a href="/downloads/cybershield-agent_1.0.0_amd64.deb">Linux (.deb)</a></li>
     </ul>
   </body>
   </html>
   ```

2. **Configurar servidor web** (nginx example):
   ```nginx
   server {
     listen 80;
     server_name downloads.cybershield.com;
     
     location /downloads/ {
       alias /var/www/cybershield/downloads/;
       autoindex on;
     }
   }
   ```

#### Checksums e Assinaturas

1. **Gerar checksums:**
   ```bash
   sha256sum CyberShield-Server-Installer.exe > checksums.txt
   sha256sum cybershield-server_1.0.0_amd64.deb >> checksums.txt
   ```

2. **Assinar pacotes:**
   ```bash
   gpg --detach-sign --armor CyberShield-Server-Installer.exe
   ```

---

## 🚀 Deploy em Produção

### Checklist de Produção

- [ ] SSL/TLS configurado
- [ ] Firewall configurado
- [ ] Backup automático habilitado
- [ ] Logs rotacionados
- [ ] Monitoramento configurado
- [ ] Autenticação fortalecida
- [ ] Atualizações automáticas configuradas

### Backup e Recuperação

**Backup automático (Linux):**
```bash
#!/bin/bash
# /etc/cron.daily/cybershield-backup

BACKUP_DIR="/backup/cybershield"
DATE=$(date +%Y%m%d)

tar -czf "$BACKUP_DIR/server-$DATE.tar.gz" /opt/cybershield/server/
tar -czf "$BACKUP_DIR/database-$DATE.tar.gz" /opt/cybershield/server/database/

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

### Monitoramento

**Verificação de saúde:**
```bash
#!/bin/bash
# health-check.sh

curl -f http://localhost:8080/health || systemctl restart cybershield-server
```

---

## 📞 Suporte

Para suporte adicional:
- 📧 Email: suporte@cybershield.com
- 🌐 Website: https://cybershield.com/support
- 📖 Documentação: https://docs.cybershield.com

---

**Versão do Documento:** 1.0.0  
**Última Atualização:** 2025-01-08
