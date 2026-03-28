import { requireEnv } from '../_shared/env.ts';
/**
 * build-agent-exe Edge Function
 * 
 * FORCE REBUILD: 2025-11-21T02:35:00Z - ParserError fix linhas 496-497
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { WINDOWS_INSTALLER_TEMPLATE } from '../_shared/installer-template.ts';
import { createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { BuildTelemetry } from '../_shared/build-telemetry.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BuildRequestSchema = z.object({
  agent_name: z.string().min(1, 'agent_name is required').max(255),
  enrollment_key: z.string().min(1, 'enrollment_key is required').max(255),
});
import { BuildTelemetry } from '../_shared/build-telemetry.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const BUILD_GH_TOKEN = Deno.env.get('BUILD_GH_TOKEN');
const BUILD_GH_REPOSITORY = Deno.env.get('BUILD_GH_REPOSITORY'); // e.g., "username/repo"

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  logger.info('[build-agent-exe] Function started', { 
    timestamp: new Date().toISOString(), 
    requestId,
    method: req.method 
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  if (req.method === 'GET') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ghToken = Deno.env.get('BUILD_GH_TOKEN');
    const ghRepo = Deno.env.get('BUILD_GH_REPOSITORY');
    
    const healthy = !!(supabaseUrl && supabaseServiceKey && ghToken && ghRepo);
    
    return new Response(
      JSON.stringify({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'build-agent-exe',
        checks: {
          env_vars: healthy,
          supabase_url: !!supabaseUrl,
          service_role_key: !!supabaseServiceKey,
          github_token: !!ghToken,
          github_repo: !!ghRepo
        }
      }),
      {
        status: healthy ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    return await withTimeout(async () => {
      // ? Initialize telemetry (will be updated after build record creation)
      let telemetry: BuildTelemetry | null = null;
      
      // ? FASE 1.2: LOGS EXPLICITOS NO INICIO
      logger.info(`[${requestId}] ========== BUILD REQUEST START ==========`);
      logger.info(`[${requestId}] Method: ${req.method}`);
      logger.info(`[${requestId}] GitHub Token Present: ${!!BUILD_GH_TOKEN}`);
      logger.info(`[${requestId}] GitHub Repository: ${BUILD_GH_REPOSITORY || 'NOT SET'}`);
      
      // 1. Validate environment variables
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !supabaseServiceKey) {
      logger.error(`[${requestId}] CRITICAL: Missing Supabase environment variables`, {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey
      });
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Server configuration error', 503, requestId);
    }

    // 2. Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      logger.warn('Missing authorization header', { requestId });
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(SUPABASE_URL, requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 2. Verify user permissions (admin)
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Invalid token', 401, requestId);
    }

    // 3. Parse and validate request body
    const rawBody = await req.json();
    const parsed = BuildRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, `Validation failed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`, 400, requestId);
    }
    const { agent_name, enrollment_key } = parsed.data;

    logger.info('Build EXE request received', { requestId, agent_name, user_id: user.id });

    // 4. Validate enrollment key and get agent_token
    const serviceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: enrollmentData, error: enrollmentError } = await serviceRoleClient
      .from('enrollment_keys')
      .select('id, agent_id, tenant_id, is_active, expires_at, agent_token')
      .eq('key', enrollment_key)
      .maybeSingle();

    if (enrollmentError || !enrollmentData || !enrollmentData.is_active) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid or expired enrollment key', 400, requestId);
    }

    // V-4006 FIX: Validate user belongs to the enrollment key's tenant
    const { data: userTenantRole } = await serviceRoleClient
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', enrollmentData.tenant_id)
      .maybeSingle();
    
    if (!userTenantRole) {
      logger.warn(`[SECURITY] User ${user.id} tried to build agent for unauthorized tenant ${enrollmentData.tenant_id}`);
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Access denied: enrollment key belongs to different tenant', 403, requestId);
    }

    // Get token from enrollment_keys (stored during auto-generate-enrollment)
    if (!enrollmentData.agent_token) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Agent token not available. Please generate a new enrollment key.', 400, requestId);
    }

    // 5. Fetch agent credentials (hmac_secret from agents table)
    const { data: agentData } = await serviceRoleClient
      .from('agents')
      .select('agent_name, hmac_secret')
      .eq('id', enrollmentData.agent_id)
      .maybeSingle();

    if (!agentData) {
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Agent credentials incomplete', 500, requestId);
    }
    
    const agentToken = enrollmentData.agent_token;

    // FASE 1 CRITICO: Fetch agent script from storage
    logger.info('Fetching agent script from storage', { requestId });
    
    const { validateAgentScriptContent, calculateScriptHash } = await import('../_shared/agent-script-validator.ts');
    
    // Buscar script do storage bucket
    const { data: fileData, error: storageError } = await serviceRoleClient.storage
      .from('agent-installers')
      .download('scripts/cybershield-agent-windows-v3.ps1');
    
    if (storageError || !fileData) {
      logger.error('Failed to fetch script from storage', { requestId, error: storageError });
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Agent script not found in storage',
        503,
        requestId
      );
    }
    
    const agentScriptContent = await fileData.text();
    
    if (!validateAgentScriptContent(agentScriptContent)) {
      logger.error('CRITICAL: Script validation failed', { requestId });
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Agent script content is invalid',
        503,
        requestId
      );
    }
    
    const agentScriptHash = await calculateScriptHash(agentScriptContent);
    
    logger.success(`Agent script validated: ${agentScriptContent.length} bytes, hash: ${agentScriptHash}`);

    // ========================================
    // FASE 2: BUILD CACHE - Verificar se existe build recente
    // ========================================
    const cacheKey = await (async () => {
      const encoder = new TextEncoder();
      const data = encoder.encode(enrollmentData.tenant_id + agentScriptHash + 'v3.0.0');
      const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => null);
      if (!hashBuffer) {
        // Fallback se MD5 não disponível
        return `${enrollmentData.tenant_id}-${agentScriptHash.slice(0, 16)}-v3.0.0`;
      }
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    })();

    logger.info(`[${requestId}] Checking build cache`, { cacheKey });

    // Buscar build cacheado (completado nos últimos 24h com mesmo cache_key)
    const { data: cachedBuild } = await serviceRoleClient
      .from('agent_builds')
      .select('id, download_url, sha256_hash, file_size_bytes, download_expires_at')
      .eq('tenant_id', enrollmentData.tenant_id)
      .eq('build_status', 'completed')
      .eq('script_hash', agentScriptHash)
      .order('build_completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Verificar se o cache é válido (URL não expirada)
    if (cachedBuild?.download_url && cachedBuild.download_expires_at) {
      const expiresAt = new Date(cachedBuild.download_expires_at);
      const now = new Date();
      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilExpiry > 1) { // Ainda válido por mais de 1 hora
        logger.info(`[${requestId}] ✅ BUILD CACHE HIT - Returning cached build`, {
          build_id: cachedBuild.id,
          expires_in_hours: hoursUntilExpiry.toFixed(1)
        });

        return new Response(JSON.stringify({
          success: true,
          build_id: cachedBuild.id,
          status: 'cached',
          download_url: cachedBuild.download_url,
          sha256_hash: cachedBuild.sha256_hash,
          file_size_bytes: cachedBuild.file_size_bytes,
          cached: true,
          message: 'Build recuperado do cache (mesmo tenant/script/versão)'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        logger.info(`[${requestId}] Cache expired or expiring soon, triggering new build`, {
          hours_until_expiry: hoursUntilExpiry.toFixed(1)
        });
      }
    } else {
      logger.info(`[${requestId}] No valid cached build found, triggering new build`);
    }

    // [OK]  FASE 1: Windows Installer Template APEX v3.0.0 (FULL SYNC with install-windows-template.ps1)
    const WINDOWS_INSTALLER_TEMPLATE = `# CyberShield Agent - Windows Installation Script v3.0.0-APEX
# Auto-generated: {{TIMESTAMP}}
# APEX BUILD - Universal, Robust, Production-Ready

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.0.0-APEX" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar privilegios de administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERRO: Este script requer privilegios de administrador" -ForegroundColor Red
    Write-Host "Clique direito no arquivo e selecione 'Executar como Administrador'" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Verificar versao do PowerShell
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "ERRO: Este script requer PowerShell 5.1 ou superior" -ForegroundColor Red
    Write-Host "Versao atual: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Configuracao
$AgentToken = "{{AGENT_TOKEN}}"
$HmacSecret = "{{HMAC_SECRET}}"
$ServerUrl = "{{SERVER_URL}}"
$PollInterval = 60

# Validar parametros
if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "{{AGENT_TOKEN}}") {
    Write-Host "ERRO: Token do agente nao configurado" -ForegroundColor Red
    Write-Host "Por favor, gere um novo instalador atraves do dashboard web" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Diretorio de instalacao - [OK]  FASE 1.1: Path unificado
$InstallDir = "C:\\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

# [OK]  FASE 1.1: Funcao de log de instalacao
function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

$installStartTime = Get-Date

$installStartTime = Get-Date

try {
    Write-InstallLog "[1/8] Criando diretorios de instalacao..."
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Write-InstallLog "? Diretorios criados com sucesso"

    # [OK]  FASE 1.2: Configurar proxy e TLS globalmente
    Write-InstallLog "[2/8] Configurando rede (TLS 1.2 + Proxy)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    $proxyUri = $proxy.GetProxy((New-Object System.Uri("https://www.google.com")))
    
    if ($proxyUri -ne "https://www.google.com") {
        Write-InstallLog "Proxy detectado: $proxyUri"
        [System.Net.WebRequest]::DefaultWebProxy = $proxy
        [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
    } else {
        Write-InstallLog "Nenhum proxy detectado - conexao direta"
    }
    Write-InstallLog "? TLS 1.2 habilitado e proxy configurado"

    # [OK]  FASE 1.3: Health check inicial com retry mechanism
    Write-InstallLog "[3/8] Testando conectividade com backend (ate 3 tentativas)..."
    $healthCheck = $false
    $healthUrls = @(
        "$ServerUrl/functions/v1/heartbeat",
        "$ServerUrl/functions/v1/post-installation-telemetry",
        "https://www.google.com"
    )

    $maxRetries = 3
    $retryDelay = 2 # segundos

    foreach ($url in $healthUrls) {
        $retryCount = 0
        $success = $false
        
        while ($retryCount -lt $maxRetries -and -not $success) {
            try {
                if ($retryCount -gt 0) {
                    Write-InstallLog "Tentativa $($retryCount + 1) de $maxRetries para $url"
                    Start-Sleep -Seconds $retryDelay
                }
                $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing
                if ($response.StatusCode -eq 200) {
                    Write-InstallLog "? Conectividade verificada: $url"
                    $healthCheck = $true
                    $success = $true
                    break
                }
            } catch {
                $retryCount++
                Write-InstallLog "? Tentativa $retryCount falhou: $url - $($_.Exception.Message)"
                if ($retryCount -ge $maxRetries) {
                    Write-InstallLog "? Todas as tentativas falharam para: $url"
                }
            }
        }
        
        if ($success) {
            break
        }
    }

    if (-not $healthCheck) {
        Write-Host ""
        Write-Host "[WARN]  AVISO: Nao foi possivel conectar ao backend." -ForegroundColor Yellow
        Write-Host "Possiveis causas:" -ForegroundColor Yellow
        Write-Host "  1. Firewall bloqueando HTTPS (porta 443)" -ForegroundColor Gray
        Write-Host "  2. Proxy corporativo nao configurado" -ForegroundColor Gray
        Write-Host "  3. Servidor backend offline" -ForegroundColor Gray
        Write-Host ""
        $continue = Read-Host "Continuar instalacao mesmo assim? (S/N)"
        if ($continue -ne "S") {
            Write-InstallLog "Instalacao cancelada pelo usuario (sem conectividade)"
            exit 1
        }
    }

    Write-InstallLog "[4/8] Salvando script do agente (embedded)..."
    
    # [OK]  FASE 1.4: Conteudo do script do agente (embedded)
    $AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

    # Salvar script do agente
    Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force
    Write-InstallLog "? Script do agente salvo em: $AgentScript"

    Write-InstallLog "[5/8] Configurando regra de firewall..."
    try {
        # Remover regras antigas se existirem
        $existingRule = Get-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        if ($existingRule) {
            Remove-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        }
        
        # Criar nova regra de firewall
        New-NetFirewallRule -DisplayName "CyberShield Agent" \`
                           -Direction Outbound \`
                           -Action Allow \`
                           -Protocol TCP \`
                           -RemotePort 443 \`
                           -Program "powershell.exe" \`
                           -Description "Permite comunicacao do CyberShield Agent com o servidor" \`
                           -ErrorAction Stop | Out-Null
        Write-InstallLog "? Regra de firewall configurada"
    } catch {
        Write-InstallLog "[WARN]  Nao foi possivel criar regra de firewall: $($_.Exception.Message)"
    }

    Write-InstallLog "[6/8] Criando tarefa agendada..."

    $taskName = "CyberShield Agent"
    $taskDescription = "CyberShield Security Agent - Monitora o sistema e reporta ao servidor central"

    # Remover tarefa existente se presente
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-InstallLog "  Removendo tarefa antiga..."
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # [OK]  FASE 2: Criar acao com TODOS os parametros necessarios
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" \`
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScript\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -AgentName \`"$AgentName\`" -PollInterval $PollInterval"

    # Criar trigger (na inicializacao do sistema)
    $trigger = New-ScheduledTaskTrigger -AtStartup

    # Criar configuracoes com restart policies
    $settings = New-ScheduledTaskSettingsSet \`
        -AllowStartIfOnBatteries \`
        -DontStopIfGoingOnBatteries \`
        -StartWhenAvailable \`
        -RestartCount 3 \`
        -RestartInterval (New-TimeSpan -Minutes 1) \`
        -ExecutionTimeLimit (New-TimeSpan -Days 365)

    # Criar principal (executar como SYSTEM com privilegios maximos)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    # Registrar tarefa
    Register-ScheduledTask \`
        -TaskName $taskName \`
        -Description $taskDescription \`
        -Action $action \`
        -Trigger $trigger \`
        -Settings $settings \`
        -Principal $principal \`
        -Force | Out-Null

    Write-InstallLog "? Tarefa agendada criada com sucesso"

    Write-InstallLog "[7/8] Iniciando o agente..."

    # Iniciar a tarefa
    Start-ScheduledTask -TaskName $taskName

    # Aguardar um momento para a tarefa iniciar
    Start-Sleep -Seconds 3

    # Verificar se a tarefa esta rodando
    $task = Get-ScheduledTask -TaskName $taskName
    $taskState = $task.State
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName

    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "? INSTALACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""

    if ($taskState -eq "Running") {
        Write-Host "Status do Agente: " -NoNewline
        Write-Host "RODANDO" -ForegroundColor Green
    } else {
        Write-Host "Status do Agente: " -NoNewline
        Write-Host "$taskState" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "INFORMACOES DA INSTALACAO:" -ForegroundColor Cyan
    Write-Host "  ? Diretorio: $InstallDir" -ForegroundColor White
    Write-Host "  ? Logs: $LogDir\\agent.log" -ForegroundColor White
    Write-Host "  ? Logs de instalacao: $InstallLog" -ForegroundColor White
    Write-Host "  ? Tarefa: $taskName" -ForegroundColor White
    Write-Host "  ? Ultima execucao: $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host ""

    # [OK]  FASE 1.5: Validacao pos-instalacao + Telemetria com Retry
    Write-InstallLog "[8/10] Validando instalacao..."
    
    # Validar que Scheduled Task foi criada (FASE 1.1)
    Write-Host "[SCAN]  Validando Scheduled Task..." -ForegroundColor Cyan
    $taskExists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $taskExists) {
        Write-Host "[ERROR]  CRITICO: Scheduled Task '$taskName' nao foi criada!" -ForegroundColor Red
        Write-InstallLog "[ERROR]  Validacao falhou: Scheduled Task nao encontrada"
        $taskValidation = $false
    } else {
        Write-Host "[OK]  Scheduled Task validada" -ForegroundColor Green
        Write-InstallLog "? Scheduled Task validada"
        $taskValidation = $true
    }
    
    # Validar que processo do agente esta rodando (FASE 1.1)
    Write-InstallLog "[9/10] Validando processo do agente..."
    Write-Host "[SCAN]  Validando processo do agente..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5  # Aguardar agente iniciar
    $agentProcess = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*cybershield-agent-windows.ps1*"
    }
    if (-not $agentProcess) {
        Write-Host "[WARN] ? Processo do agente nao detectado imediatamente (pode estar iniciando via Scheduled Task)" -ForegroundColor Yellow
        Write-InstallLog "[WARN]  Processo nao detectado imediatamente"
        $processValidation = $false
    } else {
        Write-Host "[OK]  Processo do agente validado (PID: $($agentProcess.Id))" -ForegroundColor Green
        Write-InstallLog "? Processo validado (PID: $($agentProcess.Id))"
        $processValidation = $true
    }
    
    # [OK]  FASE 1.5: Enviar telemetria pos-instalacao com Retry (FASE 1.1)
    Write-InstallLog "[10/10] Enviando telemetria pos-instalacao..."
    $telemetryBody = @{
        agent_name = "{{AGENT_NAME}}"
        success = $true
        os_version = (Get-WmiObject Win32_OperatingSystem).Caption
        installation_time = (Get-Date).ToUniversalTime().ToString("o")
        network_tests = @{
            health_check_passed = $healthCheck
            proxy_detected = ($proxyUri -ne "https://www.google.com")
        }
        validation = @{
            task_validated = $taskValidation
            process_validated = $processValidation
        }
    } | ConvertTo-Json
    
    # Retry mechanism for telemetry (FASE 1.1 - 3 attempts with exponential backoff)
    $telemetrySent = $false
    $maxRetries = 3
    for ($i = 1; $i -le $maxRetries; $i++) {
        try {
            Write-Host "? Enviando telemetria (tentativa $i/$maxRetries)..." -ForegroundColor Cyan
            Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" \`
                -Method POST \`
                -Body $telemetryBody \`
                -ContentType "application/json" \`
                -TimeoutSec 10 \`
                -ErrorAction Stop | Out-Null
            Write-Host "[OK]  Telemetria enviada com sucesso" -ForegroundColor Green
            Write-InstallLog "? Telemetria enviada com sucesso"
            $telemetrySent = $true
            break
        } catch {
            $waitTime = [math]::Pow(2, $i)  # Exponential backoff: 2s, 4s, 8s
            Write-Host "[WARN] ? Tentativa $i falhou: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-InstallLog "[WARN]  Telemetria tentativa $i falhou: $($_.Exception.Message)"
            if ($i -lt $maxRetries) {
                Write-Host "? Aguardando $waitTime segundos antes de retentar..." -ForegroundColor Yellow
                Start-Sleep -Seconds $waitTime
            }
        }
    }
    
    if (-not $telemetrySent) {
        Write-Host "[WARN] ? Falha ao enviar telemetria apos $maxRetries tentativas (nao critico)" -ForegroundColor Yellow
        Write-InstallLog "[WARN]  Falha ao enviar telemetria apos $maxRetries tentativas"
    }

    Write-Host ""
    Write-Host "Instalacao concluida! Monitorando agente por 60 segundos..." -ForegroundColor Cyan
    Write-Host "Feche esta janela a qualquer momento." -ForegroundColor Gray
    Write-Host ""

    # [OK]  FASE 1.6: Keep-Alive monitoring
    for ($i = 1; $i -le 12; $i++) {
        Start-Sleep -Seconds 5
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
        
        Write-Host "[$i/12] Task Status: $($task.State) | Last Result: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
        
        if ($task.State -eq "Running") {
            Write-Host "? Agente esta rodando!" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "Monitoramento concluido. Instalador sera fechado em 10 segundos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

} catch {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Red
    Write-Host "ERRO DURANTE A INSTALACAO" -ForegroundColor Red
    Write-Host "==================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalhes do erro:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}
`;
    
    // [OK]  FASE 1.7: Replace placeholders including agent script content
    const installerContent = WINDOWS_INSTALLER_TEMPLATE
      .replace(/\{\{AGENT_TOKEN\}\}/g, agentToken)
      .replace(/\{\{HMAC_SECRET\}\}/g, agentData.hmac_secret)
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
      .replace(/\{\{AGENT_NAME\}\}/g, agent_name)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // 7. Create build record (with script_hash for cache key)
    const { data: buildRecord, error: buildError } = await serviceRoleClient
      .from('agent_builds')
      .insert({
        tenant_id: enrollmentData.tenant_id,
        agent_id: enrollmentData.agent_id,
        enrollment_key_id: enrollmentData.id,
        build_status: 'building',
        build_started_at: new Date().toISOString(),
        created_by: user.id,
        script_hash: agentScriptHash,  // FASE 2: Para cache lookup
        ps1_version: 'v3.0.0'
      })
      .select()
      .single();

    if (buildError) {
      logger.error('Failed to create build record', { error: buildError, requestId });
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to create build', 500, requestId);
    }

    // ? Initialize telemetry with build_id
    telemetry = new BuildTelemetry(buildRecord.id, requestId);
    telemetry.info('Build record created', { 
      agent_name,
      tenant_id: enrollmentData.tenant_id,
      enrollment_key_id: enrollmentData.id
    });
    
    logger.info('Build record created', { requestId, build_id: buildRecord.id });

    // 8. Test GitHub API connectivity first
    telemetry?.startStep('github_validation', {
      has_token: !!BUILD_GH_TOKEN,
      repository: BUILD_GH_REPOSITORY
    });
    
    if (!BUILD_GH_TOKEN || !BUILD_GH_REPOSITORY) {
      const errorMsg = 'GitHub integration not configured (BUILD_GH_TOKEN or BUILD_GH_REPOSITORY missing)';
      telemetry?.failStep('github_validation', errorMsg);
      telemetry?.failBuild(errorMsg);
      
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: errorMsg,
          build_completed_at: new Date().toISOString()
        })
        .eq('id', buildRecord.id);
        
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build service not configured', 500, requestId);
    }

    // Test GitHub API connectivity
    try {
      const testResponse = await fetch(
        `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/actions/workflows`,
        { headers: { Authorization: `Bearer ${BUILD_GH_TOKEN}` } }
      );

      if (!testResponse.ok) {
        throw new Error(`GitHub API unreachable: ${testResponse.status}`);
      }
      
      telemetry?.completeStep('github_validation', {
        status_code: testResponse.status
      });
      logger.info('GitHub API connectivity test passed', { requestId });
    } catch (ghError) {
      telemetry?.failStep('github_validation', ghError as Error);
      telemetry?.failBuild(ghError as Error);
      
      logger.error('GitHub API connectivity test failed', { error: ghError, requestId });
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: `GitHub API unreachable: ${ghError}`,
          build_completed_at: new Date().toISOString()
        })
        .eq('id', buildRecord.id);
        
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'GitHub API unreachable', 500, requestId);
    }

    // [OK]  FASE 3.2: Converter PS1 para Base64 (Deno std lib - industrial-grade)
    telemetry?.startStep('encode_installer', {
      installer_size_bytes: installerContent.length
    });
    
    const ps1Encoder = new TextEncoder();
    const ps1Bytes = ps1Encoder.encode(installerContent);
    const ps1Base64 = encodeBase64(ps1Bytes);
    
    telemetry?.completeStep('encode_installer', {
      base64_size_bytes: ps1Base64.length,
      compression_ratio: (ps1Base64.length / installerContent.length).toFixed(2)
    });

    const githubActionsUrl = `https://github.com/${BUILD_GH_REPOSITORY}/actions`;
    // [OK]  FASE 3.1: Update version to 3.0.0-APEX
    const workflowPayload = {
      ps1_content_base64: ps1Base64,
      output_name: `CyberShield-Agent-${agent_name}-${Date.now()}.exe`,
      version: '3.0.0',
      build_id: buildRecord.id,
      callback_url: `${SUPABASE_URL}/functions/v1/build-callback`,
      callback_token: SUPABASE_SERVICE_ROLE_KEY
    };

    let triggerSuccess = false;
    let triggerMethod = '';

    // ? FASE 1.3: Retry automatico com exponential backoff ENHANCED
    const maxDispatchRetries = 3;
    let dispatchAttempt = 0;
    let lastError = '';
    const retryDelays = [2000, 4000, 8000]; // 2s, 4s, 8s - true exponential backoff

    // Try repository_dispatch with retry
    while (!triggerSuccess && dispatchAttempt < maxDispatchRetries) {
      dispatchAttempt++;
      
      telemetry?.startStep(`github_dispatch_attempt_${dispatchAttempt}`, {
        attempt: dispatchAttempt,
        max_retries: maxDispatchRetries,
        method: 'repository_dispatch'
      });
      
      try {
        logger.info(`[${requestId}] ? FASE 1.3: GitHub dispatch (tentativa ${dispatchAttempt}/${maxDispatchRetries})`, {
          build_id: buildRecord.id,
          repository: BUILD_GH_REPOSITORY,
          hasToken: !!BUILD_GH_TOKEN,
          tokenLength: BUILD_GH_TOKEN?.length || 0
        });
        
        const dispatchUrl = `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/dispatches`;
        
        logger.info(`[${requestId}] Enviando repository_dispatch para GitHub`, {
          url: dispatchUrl,
          event_type: 'build-agent-exe',
          attempt: dispatchAttempt
        });
        
        const dispatchResponse = await fetch(dispatchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BUILD_GH_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CyberShield-Agent-Builder',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify({
            event_type: 'build-agent-exe',
            client_payload: workflowPayload
          })
        });

        // Log detailed response info
        logger.info(`[${requestId}] GitHub dispatch response details`, {
          success: dispatchResponse.ok,
          status: dispatchResponse.status,
          statusText: dispatchResponse.statusText,
          headers: {
            rateLimit: dispatchResponse.headers.get('x-ratelimit-remaining'),
            rateLimitReset: dispatchResponse.headers.get('x-ratelimit-reset'),
            contentType: dispatchResponse.headers.get('content-type')
          },
          url: dispatchUrl,
          has_token: !!BUILD_GH_TOKEN,
          token_length: BUILD_GH_TOKEN?.length,
          repository: BUILD_GH_REPOSITORY,
          attempt: dispatchAttempt
        });

        if (dispatchResponse.ok || dispatchResponse.status === 204) {
          triggerSuccess = true;
          triggerMethod = 'repository_dispatch';
          
          telemetry?.completeStep(`github_dispatch_attempt_${dispatchAttempt}`, {
            success: true,
            status_code: dispatchResponse.status,
            total_attempts: dispatchAttempt
          });
          
          logger.success(`[${requestId}] [OK]  GitHub dispatch SUCESSO na tentativa ${dispatchAttempt}/${maxDispatchRetries}`, {
            build_id: buildRecord.id,
            status: dispatchResponse.status,
            method: 'repository_dispatch',
            attempts: dispatchAttempt,
            retry_count: dispatchAttempt - 1
          });
          break;
        } else {
          const errorText = await dispatchResponse.text();
          lastError = `Status ${dispatchResponse.status}: ${errorText}`;
          
          // Check if it's a non-retryable error (4xx client errors)
          const isClientError = dispatchResponse.status >= 400 && dispatchResponse.status < 500;
          
          logger.error(`[${requestId}] [ERROR]  GitHub API error response`, {
            status: dispatchResponse.status,
            statusText: dispatchResponse.statusText,
            body: errorText,
            url: dispatchUrl,
            has_token: !!BUILD_GH_TOKEN,
            token_prefix: BUILD_GH_TOKEN?.substring(0, 8),
            repository: BUILD_GH_REPOSITORY,
            attempt: dispatchAttempt,
            retryable: !isClientError
          });
          
          logger.warn(`[${requestId}] [WARN]  Tentativa ${dispatchAttempt}/${maxDispatchRetries} falhou`, { 
            status: dispatchResponse.status,
            statusText: dispatchResponse.statusText,
            error: errorText,
            retryable: !isClientError
          });
          
          // Don't retry on client errors (4xx)
          if (isClientError) {
            logger.error(`[${requestId}] [ERROR]  Non-retryable client error detected`, {
              status: dispatchResponse.status
            });
            break;
          }
          
          // Exponential backoff before next retry
          if (dispatchAttempt < maxDispatchRetries) {
            const backoffMs = retryDelays[dispatchAttempt - 1];
            telemetry?.info(`Exponential backoff: ${backoffMs}ms`, { 
              attempt: dispatchAttempt,
              next_delay: backoffMs
            });
            logger.info(`[${requestId}] ? Aguardando ${backoffMs}ms antes do proximo retry...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      } catch (dispatchError: Record<string, unknown>) {
        lastError = dispatchError.message;
        
        telemetry?.failStep(`github_dispatch_attempt_${dispatchAttempt}`, dispatchError, {
          attempt: dispatchAttempt,
          will_retry: dispatchAttempt < maxDispatchRetries,
          error_type: dispatchError.name
        });
        
        logger.error(`[${requestId}] [ERROR]  repository_dispatch exception (tentativa ${dispatchAttempt}/${maxDispatchRetries})`, { 
          error: dispatchError.message,
          error_type: dispatchError.name,
          stack: dispatchError.stack
        });
        
        // Exponential backoff before retry on network errors
        if (dispatchAttempt < maxDispatchRetries) {
          const backoffMs = retryDelays[dispatchAttempt - 1];
          logger.info(`[${requestId}] ? Network error - waiting ${backoffMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // Se todas as tentativas falharam, marcar como failed
    if (!triggerSuccess) {
      telemetry?.warn('All repository_dispatch attempts failed, trying workflow_dispatch fallback', {
        total_attempts: maxDispatchRetries,
        last_error: lastError
      });
      
      logger.error(`[${requestId}] [ERROR]  Todas as ${maxDispatchRetries} tentativas de dispatch falharam`);
      
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          build_completed_at: new Date().toISOString(),
          error_message: `GitHub dispatch failed after ${maxDispatchRetries} attempts: ${lastError}`
        })
        .eq('id', buildRecord.id);
      
      logger.info(`[${requestId}] Tentando fallback para workflow_dispatch...`);
    }

    // Fallback to workflow_dispatch if repository_dispatch failed
    if (!triggerSuccess) {
      telemetry?.startStep('workflow_dispatch_fallback');
      
      try {
        logger.info('Attempting workflow_dispatch trigger', { requestId, build_id: buildRecord.id });
        
        const workflowUrl = `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/actions/workflows/build-agent-exe.yml/dispatches`;
        const workflowResponse = await fetch(workflowUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BUILD_GH_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              ps1_content: installerContent,
              output_name: workflowPayload.output_name,
              version: workflowPayload.version,
              build_id: workflowPayload.build_id,
              callback_url: workflowPayload.callback_url,
              callback_token: workflowPayload.callback_token
            }
          })
        });

        if (workflowResponse.ok || workflowResponse.status === 204) {
          triggerSuccess = true;
          triggerMethod = 'workflow_dispatch';
          
          telemetry?.completeStep('workflow_dispatch_fallback', {
            success: true,
            status_code: workflowResponse.status
          });
          
          logger.info('workflow_dispatch succeeded', { requestId, build_id: buildRecord.id });
        } else {
          const errorText = await workflowResponse.text();
          telemetry?.failStep('workflow_dispatch_fallback', `Status ${workflowResponse.status}: ${errorText}`);
          logger.error('workflow_dispatch also failed', { error: errorText, requestId });
        }
      } catch (workflowError) {
        telemetry?.failStep('workflow_dispatch_fallback', workflowError as Error);
        logger.error('workflow_dispatch exception', { error: workflowError, requestId });
      }
    }

    if (!triggerSuccess) {
      const errorMessage = 'Both repository_dispatch and workflow_dispatch failed. Check GitHub Actions configuration.';
      
      telemetry?.failBuild(errorMessage, {
        repository_dispatch_attempts: maxDispatchRetries,
        workflow_dispatch_attempted: true,
        last_error: lastError
      });
      
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: errorMessage,
          build_completed_at: new Date().toISOString()
        })
        .eq('id', buildRecord.id);
        
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to trigger build', 500, requestId);
    }

    // Save GitHub Actions URL for monitoring
    telemetry?.startStep('update_build_record');
    
    await serviceRoleClient
      .from('agent_builds')
      .update({
        github_run_url: githubActionsUrl,
        build_log: [{ 
          timestamp: new Date().toISOString(), 
          message: `Build triggered via ${triggerMethod}`,
          url: githubActionsUrl
        }]
      })
      .eq('id', buildRecord.id);
    
    telemetry?.completeStep('update_build_record');
    telemetry?.completeBuild({
      trigger_method: triggerMethod,
      github_actions_url: githubActionsUrl,
      total_dispatch_attempts: dispatchAttempt
    });

    logger.info('GitHub workflow triggered successfully', { 
      requestId, 
      build_id: buildRecord.id,
      method: triggerMethod,
      actions_url: githubActionsUrl
    });

      // 9. Return async response
      return new Response(JSON.stringify({
        success: true,
        build_id: buildRecord.id,
        status: 'building',
        message: 'Build iniciado. Aguarde 2-3 minutos.',
        estimated_completion: new Date(Date.now() + 180000).toISOString(), // +3 min
        github_actions_url: githubActionsUrl
      }), {
        status: 202, // Accepted
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }, { timeoutMs: 25000 });

  } catch (error) {
    if (error instanceof Error && error.message === 'Request timeout') {
      return createTimeoutResponse(corsHeaders);
    }
    logger.error('Build request failed', { error, requestId });
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build process failed', 500, requestId);
  }
});
