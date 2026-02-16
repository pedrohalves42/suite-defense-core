import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Patch agent release v5.0.7
 * Adds Apply-ForcedUpdate function and heartbeat response processing
 * to the existing script in agent_releases
 */

const APPLY_FORCED_UPDATE_FUNCTION = `
# ============================================
#  FORCE UPDATE VIA HEARTBEAT (v5.0.7 - Ported from v4)
# ============================================
function Apply-ForcedUpdate {
    param(
        [Parameter(Mandatory = $true)]
        $Response
    )
    
    try {
        Write-Log "[FORCE UPDATE] Iniciando aplicacao de update forcado..." "INFO"
        
        $targetVersion = $Response.target_version
        $base64Content = $Response.script_content_base64
        $expectedHash = $Response.sha256
        $reason = $Response.reason
        
        if (-not $targetVersion -or -not $base64Content -or -not $expectedHash) {
            throw "Dados de force update incompletos no response"
        }
        
        Write-Log "[FORCE UPDATE] Version: $targetVersion, Reason: $reason" "INFO"
        
        # SAFE MODE CHECK
        $rollbackState = Get-RollbackState
        if ($rollbackState.safe_mode) {
            if ($Response.override_safe_mode -eq $true) {
                Write-Log "[FORCE UPDATE] Safe mode override ativo" "WARN"
            } else {
                Write-Log "[SAFE MODE] Updates desabilitados" "ERROR"
                return @{ success = $false; error = "Safe mode active" }
            }
        }
        
        $tempScript = Join-Path $env:TEMP "cybershield-force-update-$targetVersion.ps1"
        
        Write-Log "[FORCE UPDATE] Decodificando Base64..." "DEBUG"
        $bytes = [System.Convert]::FromBase64String($base64Content)
        [System.IO.File]::WriteAllBytes($tempScript, $bytes)
        Write-Log "[FORCE UPDATE] Script salvo: $($bytes.Length) bytes" "DEBUG"
        
        $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
        if ($actualHash -ne $expectedHash.ToLower()) {
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
        }
        
        Write-Log "[FORCE UPDATE] SHA256 validado: $actualHash" "SUCCESS"
        
        $installDir = "C:\\CyberShield"
        $targetScript = Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"
        
        $currentScript = $null
        $possiblePaths = @(
            $PSCommandPath,
            (Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"),
            (Join-Path $installDir "cybershield-agent-v5.ps1"),
            (Join-Path $installDir "cybershield-agent-v4.ps1"),
            (Join-Path $installDir "cybershield-agent.ps1")
        )
        
        foreach ($path in $possiblePaths) {
            if ($path -and (Test-Path $path)) {
                $currentScript = $path
                break
            }
        }
        
        if (-not $currentScript) {
            $found = Get-ChildItem -Path $installDir -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $currentScript = $found.FullName }
        }
        
        $previousPath = $Global:RollbackPaths.Previous
        if ($currentScript -and (Test-Path $currentScript)) {
            try {
                Copy-Item -Path $currentScript -Destination $previousPath -Force
                Write-Log "[FORCE UPDATE] Backup criado: $previousPath" "INFO"
                $rlbState = Get-RollbackState
                $rlbState.previous_version = $Global:AgentVersion
                Save-RollbackState -State $rlbState
            } catch {
                Write-Log "[FORCE UPDATE] Backup falhou: $($_.Exception.Message)" "WARN"
            }
        }
        
        Copy-Item -Path $tempScript -Destination $targetScript -Force
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
        Write-Log "[FORCE UPDATE] Script instalado: $targetScript" "SUCCESS"
        
        Add-EvidenceEntry -Type "force_update" -Data @{
            old_version = $Global:AgentVersion
            new_version = $targetVersion
            target_path = $targetScript
            sha256 = $actualHash
            reason = $reason
            method = "heartbeat_response"
        } -Severity "info"
        
        try {
            $confirmResult = Invoke-SecureRequest \`
                -Path "/functions/v1/confirm-force-update" \`
                -Method "POST" \`
                -Body @{
                    new_version = $targetVersion
                    old_version = $Global:AgentVersion
                } \`
                -TimeoutSec 10
            if ($confirmResult.Success) {
                Write-Log "[FORCE UPDATE] Confirmacao enviada ao backend" "SUCCESS"
            }
        } catch {
            Write-Log "[FORCE UPDATE] Falha ao confirmar (nao critico): $($_.Exception.Message)" "WARN"
        }
        
        Write-Log "[FORCE UPDATE] Update $targetVersion aplicado com sucesso!" "SUCCESS"
        
        # DYNAMIC TASK DETECTION
        Write-Log "[FORCE UPDATE] Detectando Scheduled Task..." "INFO"
        $taskName = $null
        $taskPatterns = @(
            "CyberShieldAgent-$($Global:AgentName)",
            "CyberShieldAgent",
            "CyberShield Agent",
            "CyberShield*"
        )
        
        foreach ($pattern in $taskPatterns) {
            $foundTask = Get-ScheduledTask -TaskName $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($foundTask) {
                $taskName = $foundTask.TaskName
                Write-Log "[FORCE UPDATE] Task encontrada: $taskName" "INFO"
                break
            }
        }
        
        if ($taskName) {
            try {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Write-Log "[FORCE UPDATE] Task reiniciada!" "SUCCESS"
            } catch {
                Write-Log "[FORCE UPDATE] Restart falhou: $($_.Exception.Message)" "WARN"
            }
        } else {
            Write-Log "[FORCE UPDATE] Nenhuma Task encontrada - proximo boot" "WARN"
        }
        
        Write-Log "[FORCE UPDATE] Encerrando processo atual..." "INFO"
        exit 0
        
    } catch {
        Write-Log "[FORCE UPDATE] Erro: $($_.Exception.Message)" "ERROR"
        Add-EvidenceEntry -Type "error" -Data @{
            event = "force_update_failed"
            error = $_.Exception.Message
            target_version = $Response.target_version
        } -Severity "error"
        return @{ success = $false; error = $_.Exception.Message }
    }
}
`;

const HEARTBEAT_FORCE_UPDATE_HANDLER = `            # ============================================
                    # FORCE UPDATE VIA HEARTBEAT RESPONSE (v5.0.7)
                    # ============================================
                    if ($response.force_update -eq $true) {
                        Write-Log "[FORCE UPDATE] Update forcado detectado via heartbeat!" "WARN"
                        Write-Log "[FORCE UPDATE] Target version: $($response.target_version)" "INFO"
                        
                        $updateResult = Apply-ForcedUpdate -Response $response
                        
                        if ($updateResult.success) {
                            return $true
                        } else {
                            Write-Log "[FORCE UPDATE] Falha ao aplicar: $($updateResult.error)" "ERROR"
                        }
                    }`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const url = new URL(req.url);
    const version = url.searchParams.get('version') || 'v5.0.7';
    const platform = url.searchParams.get('platform') || 'windows';

    // Read current script from DB
    const { data: release, error: fetchErr } = await supabase
      .from('agent_releases')
      .select('id, script_content, version')
      .eq('version', version)
      .eq('platform', platform)
      .single();

    if (fetchErr || !release) {
      return new Response(JSON.stringify({ error: 'Release not found', details: fetchErr }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let script = release.script_content;
    const changes: string[] = [];

    // 1. Update version header
    if (script.includes('v5.0.5 FULL ENTERPRISE') || script.includes('v5.0.6 FULL ENTERPRISE')) {
      script = script.replace(/v5\.0\.[56] FULL ENTERPRISE/g, 'v5.0.7 FULL ENTERPRISE');
      changes.push('Updated header to v5.0.7');
    }

    // 2. Update default AgentVersion param
    script = script.replace(
      /\[string\]\$AgentVersion\s*=\s*"v5\.0\.[56]"/,
      '[string]$AgentVersion = "v5.0.7"'
    );
    changes.push('Updated default AgentVersion to v5.0.7');

    // 3. Add Apply-ForcedUpdate function before Send-Heartbeat
    if (!script.includes('function Apply-ForcedUpdate')) {
      const heartbeatMarker = '# ============================================\r\n#  IMPROVED HEARTBEAT';
      const heartbeatMarkerLF = '# ============================================\n#  IMPROVED HEARTBEAT';
      
      if (script.includes(heartbeatMarker)) {
        script = script.replace(heartbeatMarker, APPLY_FORCED_UPDATE_FUNCTION + '\r\n' + heartbeatMarker);
        changes.push('Added Apply-ForcedUpdate function (CRLF)');
      } else if (script.includes(heartbeatMarkerLF)) {
        script = script.replace(heartbeatMarkerLF, APPLY_FORCED_UPDATE_FUNCTION + '\n' + heartbeatMarkerLF);
        changes.push('Added Apply-ForcedUpdate function (LF)');
      } else {
        changes.push('WARNING: Could not find heartbeat marker to insert Apply-ForcedUpdate');
      }
    } else {
      changes.push('Apply-ForcedUpdate already exists');
    }

    // 4. Replace TODO in Send-Heartbeat with force_update handler
    if (script.includes('# TODO: processar comandos do servidor')) {
      script = script.replace(
        '# TODO: processar comandos do servidor',
        HEARTBEAT_FORCE_UPDATE_HANDLER
      );
      changes.push('Replaced TODO with force_update handler in Send-Heartbeat');
    } else if (!script.includes('force_update -eq $true')) {
      // Try alternative pattern
      const todoPattern = /\$response = \$result\.Content \| ConvertFrom-Json\r?\n\s*\} catch \{ \}/;
      if (todoPattern.test(script)) {
        script = script.replace(
          todoPattern,
          `$response = $result.Content | ConvertFrom-Json\r\n${HEARTBEAT_FORCE_UPDATE_HANDLER}\r\n                } catch {\r\n                    Write-Log "[HEARTBEAT] Erro ao processar response: $($_.Exception.Message)" "WARN"\r\n                }`
        );
        changes.push('Replaced catch block with force_update handler');
      } else {
        changes.push('Force update handler already present or pattern not found');
      }
    }

    // Normalize and calculate hash
    const normalized = platform === 'windows'
      ? script.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n')
      : script.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Update DB
    const { error: updateErr } = await supabase
      .from('agent_releases')
      .update({ script_content: normalized, sha256: hash, is_active: true })
      .eq('id', release.id);

    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

    return new Response(JSON.stringify({
      success: true,
      version,
      platform,
      changes,
      new_size: bytes.length,
      sha256: hash.substring(0, 16) + '...',
      has_apply_forced_update: normalized.includes('function Apply-ForcedUpdate'),
      has_heartbeat_handler: normalized.includes('force_update -eq $true'),
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
