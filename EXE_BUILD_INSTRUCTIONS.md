# Instruções para Gerar Instalador EXE do CyberShield Agent

## Método 1: Usando ps2exe (Recomendado)

### Pré-requisitos
1. Windows PowerShell 5.1 ou PowerShell 7+
2. Módulo ps2exe instalado

### Passos

#### 1. Instalar ps2exe
```powershell
# Abrir PowerShell como Administrador
Install-Module -Name ps2exe -Scope CurrentUser -Force
```

#### 2. Preparar o Script
Certifique-se de ter o arquivo `cybershield-agent-windows.ps1` salvo em um diretório acessível.

**⚠️ IMPORTANTE - Validar HMAC Antes de Compilar:**
```powershell
# Execute a validação de formato HMAC:
.\tests\validate-hmac-format.ps1 -AgentScriptPath ".\agent-scripts\cybershield-agent-windows.ps1"

# Só continue se a validação passar!
```

**Checklist Pré-Build:**
- [ ] HMAC usa formato `${timestamp}:${nonce}:${bodyJson}` com separadores `:`
- [ ] Timestamp usa `ToUnixTimeMilliseconds()` (não `ToUnixTimeSeconds()`)
- [ ] Execute-Job contém lógica completa (scan_virus, collect_info, etc.)
- [ ] Upload-Report inclui campo `timestamp`
- [ ] Script passou em `validate-hmac-format.ps1`

#### 3. Gerar o EXE
```powershell
# Navegar até o diretório do script
cd C:\caminho\para\agent-scripts

# Converter PS1 para EXE
Invoke-ps2exe `
    -inputFile "cybershield-agent-windows.ps1" `
    -outputFile "CyberShieldAgent-Setup.exe" `
    -title "CyberShield Agent" `
    -description "Agente de Segurança CyberShield v2.0" `
    -company "CyberShield" `
    -version "2.0.0.0" `
    -requireAdmin `
    -noConsole:$false `
    -iconFile "icon.ico"
```

**Nota:** Se você não tiver um ícone, remova o parâmetro `-iconFile`.

#### 4. Opções Avançadas
```powershell
# Com ícone personalizado e sem console (background)
Invoke-ps2exe `
    -inputFile "cybershield-agent-windows.ps1" `
    -outputFile "CyberShieldAgent-Setup.exe" `
    -title "CyberShield Agent" `
    -description "Agente de Segurança CyberShield v2.0" `
    -company "CyberShield" `
    -product "CyberShield Agent" `
    -copyright "Copyright 2025" `
    -version "2.0.0.0" `
    -requireAdmin `
    -noConsole:$true `
    -iconFile "C:\caminho\para\icon.ico"
```

### Distribuição
Após a geração, você terá um arquivo `CyberShieldAgent-Setup.exe` que pode ser distribuído.

**Para executar:**
```powershell
.\CyberShieldAgent-Setup.exe `
    -AgentToken "SEU_TOKEN_AQUI" `
    -HmacSecret "SEU_HMAC_SECRET" `
    -ServerUrl "https://seu-servidor.com" `
    -PollInterval 60
```

---

## Método 2: Usando Inno Setup (Instalador Completo)

Para criar um instalador profissional com wizard de instalação:

### Pré-requisitos
1. Baixar e instalar [Inno Setup](https://jrsoftware.org/isdl.php)

### Criar Script Inno Setup

Salve como `cybershield-installer.iss`:

```iss
#define MyAppName "CyberShield Agent"
#define MyAppVersion "2.0"
#define MyAppPublisher "CyberShield"
#define MyAppURL "https://cybershield.com"

[Setup]
AppId={{UNIQUE-GUID-HERE}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\CyberShield
DefaultGroupName=CyberShield
DisableProgramGroupPage=yes
OutputBaseFilename=CyberShieldAgent-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "cybershield-agent-windows.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\CyberShield Agent"; Filename: "{app}\cybershield-agent-windows.ps1"

[Code]
var
  AgentTokenPage: TInputQueryWizardPage;
  HmacSecretPage: TInputQueryWizardPage;
  ServerUrlPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  AgentTokenPage := CreateInputQueryPage(wpWelcome,
    'Configuração do Agente', 'Insira as credenciais do agente',
    'Token do Agente:');
  AgentTokenPage.Add('Agent Token:', False);

  HmacSecretPage := CreateInputQueryPage(AgentTokenPage.ID,
    'Configuração HMAC', 'Insira o HMAC Secret',
    'HMAC Secret:');
  HmacSecretPage.Add('HMAC Secret:', False);

  ServerUrlPage := CreateInputQueryPage(HmacSecretPage.ID,
    'Configuração do Servidor', 'Insira a URL do servidor',
    'URL do Servidor (ex: https://seu-servidor.com):');
  ServerUrlPage.Add('Server URL:', False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AgentToken: String;
  HmacSecret: String;
  ServerUrl: String;
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    AgentToken := AgentTokenPage.Values[0];
    HmacSecret := HmacSecretPage.Values[0];
    ServerUrl := ServerUrlPage.Values[0];
    
    // Instalar e iniciar serviço
    Exec('powershell.exe', 
      '-ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\cybershield-agent-windows.ps1" ' +
      '-AgentToken "' + AgentToken + '" ' +
      '-HmacSecret "' + HmacSecret + '" ' +
      '-ServerUrl "' + ServerUrl + '" ' +
      '-PollInterval 60',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;
```

### Compilar
1. Abra o Inno Setup
2. Carregue o arquivo `cybershield-installer.iss`
3. Clique em "Compile"
4. O instalador será gerado em `Output\CyberShieldAgent-Setup.exe`

---

## Método 3: NSIS (Nullsoft Scriptable Install System)

Alternativamente, você pode usar NSIS:

1. Baixar [NSIS](https://nsis.sourceforge.io/Download)
2. Criar script `.nsi` similar ao Inno Setup
3. Compilar com `makensis`

---

## Assinatura Digital (Opcional mas Recomendado)

Para evitar avisos do Windows Defender/SmartScreen:

### Obter Certificado
1. Comprar certificado de assinatura de código (ex: DigiCert, Sectigo)
2. Ou usar certificado self-signed para testes

### Assinar o EXE
```powershell
# Com certificado instalado
signtool sign /a /t http://timestamp.digicert.com CyberShieldAgent-Setup.exe

# Com arquivo PFX
signtool sign /f "certificado.pfx" /p "senha" /t http://timestamp.digicert.com CyberShieldAgent-Setup.exe
```

---

## Teste do Instalador

Antes de distribuir:

1. **Teste em máquina limpa** (VM)
2. **Verificar instalação do serviço**:
   ```powershell
   Get-Service -Name "CyberShieldAgent"
   ```
3. **Verificar logs**:
   ```powershell
   Get-EventLog -LogName Application -Source "CyberShieldAgent" -Newest 10
   ```

---

## Distribuição

### Opção 1: Download Direto
- Hospedar o EXE em servidor web
- Usuários baixam e executam

### Opção 2: GPO (Group Policy)
- Distribuir via Active Directory
- Instalação automática em máquinas do domínio

### Opção 3: SCCM/Intune
- Deploy via Microsoft Endpoint Manager
- Controle centralizado

---

## Troubleshooting

### "Execution policy" error
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Falha ao instalar módulo ps2exe
```powershell
Install-PackageProvider -Name NuGet -Force
Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
Install-Module -Name ps2exe -Force
```

### EXE bloqueado pelo Windows Defender
- Assinar digitalmente o executável
- Ou adicionar exceção no Windows Defender

---

## Recursos Adicionais

- [ps2exe GitHub](https://github.com/MScholtes/PS2EXE)
- [Inno Setup Documentation](https://jrsoftware.org/ishelp/)
- [NSIS Documentation](https://nsis.sourceforge.io/Docs/)
- [Code Signing Best Practices](https://docs.microsoft.com/en-us/windows/security/threat-protection/windows-defender-application-control/code-signing-best-practices)
