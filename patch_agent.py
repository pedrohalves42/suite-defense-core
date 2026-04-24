import json
import os
import subprocess

def get_script():
    cmd = ["psql", "-t", "-c", "SELECT script_content FROM agent_releases WHERE id = '01e757c3-9d09-41b6-9161-81380cebab40';"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout.strip()

def patch_script(content):
    # 1. Fix Initialize-Config URL logic
    old_init = '''    # Load secrets from files (preferred) or params
    $script:Config.AgentToken = Get-SecretValue -Name "agent_token" -Fallback $AgentToken
    $script:Config.HmacSecret = Get-SecretValue -Name "hmac_secret" -Fallback $HmacSecret
    $script:Config.ApiEndpoint = if ($ApiEndpoint) { $ApiEndpoint } else { $env:CYBERSHIELD_API_ENDPOINT }
    $script:Config.AgentId = $env:CYBERSHIELD_AGENT_ID
    $script:Config.TenantId = $env:CYBERSHIELD_TENANT_ID'''
    
    new_init = '''    # Load secrets from files (preferred) or params
    $script:Config.AgentToken = Get-SecretValue -Name "agent_token" -Fallback $AgentToken
    $script:Config.HmacSecret = Get-SecretValue -Name "hmac_secret" -Fallback $HmacSecret
    
    # URL Normalization (SSA-010)
    $rawEndpoint = if ($ApiEndpoint) { $ApiEndpoint } else { $env:CYBERSHIELD_API_ENDPOINT }
    if ($rawEndpoint) {
        $script:Config.ServerUrl = $rawEndpoint.TrimEnd('/') -replace '/functions/v1$', ''
        $script:Config.ApiEndpoint = "$($script:Config.ServerUrl)/functions/v1"
        $Global:ServerUrl = $script:Config.ApiEndpoint
    }
    
    $script:Config.AgentId = $env:CYBERSHIELD_AGENT_ID
    $script:Config.TenantId = $env:CYBERSHIELD_TENANT_ID'''
    
    content = content.replace(old_init, new_init)
    
    # 2. Fix Invoke-SecureApi Headers
    old_headers = '''            $headers = @{
                "Authorization" = "Bearer $($script:Config.AgentToken)"
                "Content-Type"  = "application/json"
                "X-Agent-Id"    = $script:Config.AgentId
                "X-Trace-ID"    = $traceId
                "X-Request-ID"  = $traceId
            }'''
    
    new_headers = '''            $headers = @{
                "Authorization" = "Bearer $($script:Config.AgentToken)"
                "X-Agent-Token" = $script:Config.AgentToken
                "Content-Type"  = "application/json"
                "X-Agent-Id"    = $script:Config.AgentId
                "X-Trace-ID"    = $traceId
                "X-Request-ID"  = $traceId
            }'''
            
    content = content.replace(old_headers, new_headers)
    return content

content = get_script()
if content:
    patched = patch_script(content)
    # Escape single quotes for SQL
    sql_content = patched.replace("'", "''")
    with open("update.sql", "w") as f:
        f.write(f"UPDATE agent_releases SET script_content = '{sql_content}' WHERE id = '01e757c3-9d09-41b6-9161-81380cebab40';")
    print("Patch generated.")
else:
    print("Failed to get script.")
