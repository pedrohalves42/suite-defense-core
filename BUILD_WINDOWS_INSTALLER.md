# Guia de Criação do Instalador Windows (.EXE)

Este guia explica como criar um instalador executável (.EXE) para o CyberShield Agent no Windows 10/11.

## Pré-requisitos

1. **PowerShell 5.1 ou superior**
2. **Módulo ps2exe** instalado

## Passo 1: Instalar ps2exe

Execute no PowerShell como Administrador:

```powershell
Install-Module -Name ps2exe -Scope CurrentUser -Force
```

## Passo 2: Baixar o Script do Instalador

Baixe o arquivo `install-windows-template.ps1` do diretório `public/templates/` do projeto.

## Passo 3: Substituir as Variáveis de Template

Antes de compilar, você precisa substituir os placeholders no script:

```powershell
# Abra o arquivo em um editor de texto e substitua:
# {{AGENT_TOKEN}} -> Seu token de agente real
# {{HMAC_SECRET}} -> Seu secret HMAC real
# {{SERVER_URL}} -> URL do servidor (ex: https://iavbnmduxpxhwubqrzzn.supabase.co)
# {{TIMESTAMP}} -> Data atual
# {{AGENT_SCRIPT_CONTENT}} -> Conteúdo completo do cybershield-agent-windows.ps1
```

**IMPORTANTE:** Para {{AGENT_SCRIPT_CONTENT}}, copie TODO o conteúdo do arquivo `agent-scripts/cybershield-agent-windows.ps1`.

## Passo 4: Compilar para EXE

Execute no PowerShell:

```powershell
# Navegue até o diretório onde está o script editado
cd C:\caminho\para\seu\script

# Compile o instalador
ps2exe -InputFile .\install-windows-template.ps1 `
       -OutputFile .\CyberShield-Installer.exe `
       -Title "CyberShield Agent Installer" `
       -Description "CyberShield Security Agent Installer for Windows" `
       -Company "CyberShield" `
       -Product "CyberShield Agent" `
       -Version "2.1.0" `
       -Copyright "© 2025 CyberShield" `
       -requireAdmin `
       -noConsole:$false `
       -noOutput `
       -noError
```

## Passo 5: Testar o Instalador

```powershell
# Execute o instalador (clique direito -> Executar como Administrador)
.\CyberShield-Installer.exe
```

## Passo 6: Validar a Instalação

Após executar o instalador, verifique:

```powershell
# 1. Verificar se o agente está rodando
Get-ScheduledTask -TaskName "CyberShield Agent"

# 2. Verificar logs
Get-Content C:\CyberShield\logs\agent.log -Tail 20

# 3. Verificar heartbeat no dashboard
```

## Solução de Problemas Comuns

### Erro: "Execution Policy"

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Erro: "Windows Defender bloqueou o arquivo"

1. Adicione exceção no Windows Defender
2. Ou assine digitalmente o EXE (veja seção abaixo)

### Erro: "Não consegue instalar ps2exe"

```powershell
# Tente com TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Install-Module -Name ps2exe -Force
```

## Assinatura Digital (Recomendado)

Para evitar alertas do Windows Defender:

```powershell
# Se você tem um certificado de code signing
signtool sign /f "seu-certificado.pfx" /p "senha" /t http://timestamp.digicert.com .\CyberShield-Installer.exe
```

## Distribuição

1. **Hospede o EXE** em um servidor seguro (HTTPS)
2. **Forneça o link** para download no dashboard
3. **Inclua instruções** para executar como Administrador
4. **Calcule o hash SHA256** para validação:

```powershell
Get-FileHash .\CyberShield-Installer.exe -Algorithm SHA256 | Format-List
```

## Automação com GitHub Actions (Opcional)

Você pode automatizar a criação do EXE usando GitHub Actions. Veja `.github/workflows/build-installer.yml` para exemplo.

## Notas de Segurança

⚠️ **NUNCA** commite arquivos com:
- Tokens reais de agente
- Secrets HMAC
- Credenciais em texto plano

Use variáveis de ambiente ou secrets management para produção.

## Suporte

Para problemas ou dúvidas:
- Email: gamehousetecnologia@gmail.com
- WhatsApp: (34) 98443-2835
