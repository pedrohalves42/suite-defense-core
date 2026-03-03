import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hashToken } from '../_shared/token-hash.ts';

/**
 * Nuke & Reinstall MIT-SERVIDOR
 * Auto-generates enrollment key server-side so no local files needed
 * GET /functions/v1/nuke-reinstall-mit
 */

const TENANT_ID = '3adc67e6-8908-4d98-b85b-5e93be4673a1';
const AGENT_NAME = 'MIT-SERVIDOR';

function generateKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const parts: string[] = [];
  for (let p = 0; p < 4; p++) {
    let seg = '';
    for (let i = 0; i < 4; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(seg);
  }
  return parts.join('-');
}

function buildScript(enrollmentKey: string): string {
  // We build the PowerShell script as plain strings joined by newlines
  // to avoid JS template literal escaping issues with PS backtick characters
  const D = '$'; // Dollar sign shorthand for readability
  const BS = '\\'; // Backslash
  
  const script = `# CyberShield - NUKE & REINSTALL - MIT-SERVIDOR
# Apaga TUDO e reinstala do zero (key auto-gerada pelo servidor)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
${D}ErrorActionPreference = "Stop"
${D}ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
${D}EnrollmentKey = "${enrollmentKey}"

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host " NUKE & REINSTALL - MIT-SERVIDOR" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host ""

# Admin check
${D}isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not ${D}isAdmin) {
    Write-Host "[ERROR] Execute como Administrador!" -ForegroundColor Red
    Start-Sleep -Seconds 10
    return
}

Write-Host "[OK] Enrollment Key injetada pelo servidor" -ForegroundColor Green

try {
    # 1. Kill ALL CyberShield processes
    Write-Host "[1/7] Matando processos CyberShield..." -ForegroundColor Yellow
    Get-Process | Where-Object { ${D}_.ProcessName -like "*CyberShield*" -or ${D}_.ProcessName -like "*cybershield*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-WmiObject Win32_Process -Filter "CommandLine LIKE '%cybershield-agent%'" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id ${D}_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Processos encerrados" -ForegroundColor Green

    # 2. Remove ALL scheduled tasks
    Write-Host "[2/7] Removendo scheduled tasks..." -ForegroundColor Yellow
    Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ScheduledTask -TaskName ${D}_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName ${D}_.TaskName -Confirm:${D}false -ErrorAction SilentlyContinue
        Write-Host "  Removida: ${D}(${D}_.TaskName)" -ForegroundColor Gray
    }
    Write-Host "[OK] Tasks removidas" -ForegroundColor Green

    # 3. NUKE - Delete EVERYTHING
    Write-Host "[3/7] APAGANDO C:${BS}CyberShield completamente..." -ForegroundColor Red
    if (Test-Path "C:${BS}CyberShield") {
        Remove-Item -Path "C:${BS}CyberShield" -Recurse -Force -ErrorAction Stop
        Write-Host "[OK] C:${BS}CyberShield APAGADO" -ForegroundColor Green
    } else {
        Write-Host "[OK] C:${BS}CyberShield ja nao existia" -ForegroundColor Green
    }

    # 4. Clean environment variables
    Write-Host "[4/7] Limpando variaveis de ambiente..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_JWT", ${D}null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_AGENT_NAME", ${D}null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_KEY", ${D}null, "Machine")
    Write-Host "[OK] Variaveis limpas" -ForegroundColor Green

    # 5. Clean CNG key store (fix ECDSA "object already exists" error)
    Write-Host "[5/7] Limpando chaves CNG residuais..." -ForegroundColor Yellow
    try {
        ${D}cngKeys = [System.Security.Cryptography.CngKey]::Open("CyberShield-ECDSA-Key", [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider, [System.Security.Cryptography.CngKeyOpenOptions]::MachineKey) 2>${D}null
        if (${D}cngKeys) {
            ${D}cngKeys.Delete()
            Write-Host "  [OK] Chave CNG antiga removida" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [OK] Nenhuma chave CNG residual" -ForegroundColor Gray
    }
    Write-Host "[OK] CNG limpo" -ForegroundColor Green

    # 6. Download fresh installer
    Write-Host "[6/7] Baixando instalador limpo..." -ForegroundColor Yellow
    ${D}installerUrl = "${D}ServerUrl/functions/v1/serve-installer/${D}EnrollmentKey" + "?os_type=windows&agent_name=MIT-SERVIDOR&hostname=${D}(${D}env:COMPUTERNAME)"
    Write-Host "  URL: ${D}installerUrl" -ForegroundColor Gray

    ${D}tempFile = Join-Path ${D}env:TEMP "cybershield-fresh-install.ps1"
    Invoke-WebRequest -Uri ${D}installerUrl -OutFile ${D}tempFile -UseBasicParsing -TimeoutSec 120
    ${D}fileSize = (Get-Item ${D}tempFile).Length
    Write-Host "[OK] Instalador baixado: ${D}fileSize bytes" -ForegroundColor Green

    if (${D}fileSize -lt 5000) {
        Write-Host "[ERROR] Arquivo muito pequeno - servidor pode ter retornado erro" -ForegroundColor Red
        ${D}content = Get-Content ${D}tempFile -Raw -ErrorAction SilentlyContinue
        Write-Host "  Conteudo: ${D}(${D}content.Substring(0, [Math]::Min(500, ${D}content.Length)))" -ForegroundColor Red
        return
    }

    # Validate not HTML/JSON error
    ${D}firstLine = Get-Content ${D}tempFile -TotalCount 1 -ErrorAction SilentlyContinue
    ${D}firstLineTrimmed = if (${D}firstLine) { ${D}firstLine.TrimStart() } else { "" }
    if (${D}firstLineTrimmed -like '<html*' -or ${D}firstLineTrimmed -like '<!DOCTYPE*' -or ${D}firstLineTrimmed -like '{*') {
        Write-Host "[ERROR] Servidor retornou payload invalido!" -ForegroundColor Red
        Write-Host "  Primeira linha: ${D}firstLineTrimmed" -ForegroundColor Red
        Remove-Item ${D}tempFile -Force -ErrorAction SilentlyContinue
        return
    }

    # 7. Patch and execute installer
    Write-Host "[7/7] Preparando e executando instalador..." -ForegroundColor Yellow
    ${D}raw = Get-Content ${D}tempFile -Raw

    # Extract credentials from the param() block defaults (serve-installer injects real values)
    ${D}sUrl = ""; ${D}aTok = ""; ${D}hSec = ""; ${D}aName = ""
    if (${D}raw -match '${BS}${D}ServerUrl${BS}s*=${BS}s*"([^"]+)"')  { ${D}sUrl  = ${D}Matches[1] }
    if (${D}raw -match '${BS}${D}AgentToken${BS}s*=${BS}s*"([^"]+)"') { ${D}aTok  = ${D}Matches[1] }
    if (${D}raw -match '${BS}${D}HmacSecret${BS}s*=${BS}s*"([^"]+)"') { ${D}hSec  = ${D}Matches[1] }
    if (${D}raw -match '${BS}${D}AgentName${BS}s*=${BS}s*"([^"]+)"')  { ${D}aName = ${D}Matches[1] }

    Write-Host "  ServerUrl: ${D}(${D}sUrl.Substring(0, [Math]::Min(40, ${D}sUrl.Length)))..." -ForegroundColor Gray
    Write-Host "  Token prefix: ${D}(${D}aTok.Substring(0, [Math]::Min(8, ${D}aTok.Length)))..." -ForegroundColor Gray
    Write-Host "  AgentName: ${D}aName" -ForegroundColor Gray

    if ([string]::IsNullOrEmpty(${D}aTok) -or [string]::IsNullOrEmpty(${D}hSec)) {
        Write-Host "[ERROR] Credenciais nao encontradas no instalador!" -ForegroundColor Red
        return
    }

    # Remove #Requires lines (incompatible with -Command)
    ${D}patched = ${D}raw -replace '(?m)^#Requires[^${BS}r${BS}n]*[${BS}r${BS}n]+', ''

    # Replace param() block with simple variable assignments
    # Use [char]36 = dollar sign to build variable names in the replacement string
    ${D}dollar = [char]36
    ${D}nl = [char]10
    ${D}varBlock = "${D}{dollar}ServerUrl  = ${BS}"${D}sUrl${BS}"${D}nl${D}{dollar}AgentToken = ${BS}"${D}aTok${BS}"${D}nl${D}{dollar}HmacSecret = ${BS}"${D}hSec${BS}"${D}nl${D}{dollar}AgentName  = ${BS}"${D}aName${BS}""
    ${D}patched = ${D}patched -replace '(?s)param${BS}s*${BS}(.*?${BS})', ${D}varBlock

    Set-Content -Path ${D}tempFile -Value ${D}patched -Encoding UTF8 -Force
    ${D}patchedSize = (Get-Item ${D}tempFile).Length
    Write-Host "  [OK] Script patched: ${D}patchedSize bytes (param block -> variable assignments)" -ForegroundColor Green

    # Execute the patched script
    & powershell.exe -ExecutionPolicy Bypass -NoProfile -Command ". '${D}tempFile'"

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " REINSTALACAO COMPLETA!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green

    Start-Sleep -Seconds 5
    ${D}task = Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (${D}task) {
        Write-Host "  Task: ${D}(${D}task.TaskName) | State: ${D}(${D}task.State)" -ForegroundColor Green
        try { schtasks /Run /TN ${D}task.TaskName 2>${D}null } catch { Start-ScheduledTask -TaskName ${D}task.TaskName -ErrorAction SilentlyContinue }
        Write-Host "  Task iniciada!" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Nenhuma task encontrada apos instalacao" -ForegroundColor Yellow
    }

    Remove-Item ${D}tempFile -Force -ErrorAction SilentlyContinue

} catch {
    Write-Host ""
    Write-Host "[FATAL] ${D}(${D}_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Line: ${D}(${D}_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Gray
${D}null = ${D}Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;

  return script;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate a fresh single-use enrollment key
    const plainKey = generateKey();
    const keyHash = await hashToken(plainKey);

    // Find agent
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', AGENT_NAME)
      .eq('tenant_id', TENANT_ID)
      .single();

    // Insert enrollment key linked to this agent
    const { error: insertError } = await supabase
      .from('enrollment_keys')
      .insert({
        key_hash: keyHash,
        tenant_id: TENANT_ID,
        agent_id: agent?.id || null,
        description: 'Auto-generated nuke-reinstall key for ' + AGENT_NAME,
        is_active: true,
        max_uses: 1,
        current_uses: 0,
        auto_generated: true,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error('[nuke-reinstall-mit] Failed to create enrollment key:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to provision key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[nuke-reinstall-mit] Generated temp key for ' + AGENT_NAME + ', expires in 30min');

    const script = buildScript(plainKey);

    return new Response(script, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[nuke-reinstall-mit] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
