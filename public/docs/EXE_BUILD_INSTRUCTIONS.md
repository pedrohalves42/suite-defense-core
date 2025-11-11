# Guia Completo: Build do Instalador Windows (.EXE)

## ✅ FASE 1: DEPLOY CRÍTICO - CONCLUÍDO

### Edge Functions Deployadas
- ✅ `record-failed-login` - Registra tentativas de login falhadas
- ✅ `check-failed-logins` - Verifica status de IP (bloqueado/CAPTCHA)
- ✅ `clear-failed-logins` - Limpa tentativas após login bem-sucedido

### Funções de Banco Corrigidas
- ✅ `cleanup_old_failed_attempts` - SET search_path = public
- ✅ `cleanup_old_metrics` - SET search_path = public
- ✅ `cleanup_old_security_logs` - SET search_path = public
- ✅ `get_latest_agent_metrics` - SET search_path = public

### ⚠️ AÇÃO MANUAL NECESSÁRIA
**Leaked Password Protection** precisa ser ativado manualmente no backend.

---

## 🛠️ BUILD DO INSTALADOR EXE

### Pré-requisitos

```powershell
# Instalar ps2exe
Install-Module -Name ps2exe -Scope CurrentUser -Force
```

### Processo de Build

#### PASSO 1: Baixar Instalador PS1
1. Acessar `/admin/agent-installer`
2. Informar nome do agent
3. Selecionar plataforma: Windows
4. Baixar instalador

#### PASSO 2: Compilar para EXE

```powershell
ps2exe -InputFile .\installer.ps1 `
       -OutputFile .\CyberShield-Installer-v2.2.0.exe `
       -Title "CyberShield Agent Installer" `
       -Company "CyberShield" `
       -Version "2.2.0" `
       -requireAdmin
```

#### PASSO 3: Assinatura Digital (Opcional)

```powershell
# Self-signed (teste)
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
  -Subject "CN=CyberShield" `
  -CertStoreLocation "Cert:\CurrentUser\My"

Set-AuthenticodeSignature -FilePath .\CyberShield-Installer-v2.2.0.exe `
  -Certificate $cert
```

Para produção, adquirir certificado EV de CA reconhecida (DigiCert, Sectigo).
