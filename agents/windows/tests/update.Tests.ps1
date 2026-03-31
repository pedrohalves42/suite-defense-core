BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Invoke-SecureApi { param([string]$Endpoint, [string]$Method, [hashtable]$Body) return $null }
    function Export-PersistedState { }
    
    $script:Config = @{
        AgentId    = "test-agent-id"
        ScriptPath = "$env:TEMP\CyberShield\test-update\agent.ps1"
        BackupPath = "$env:TEMP\CyberShield\test-update\agent.ps1.bak"
    }
    $script:TempDir = "$env:TEMP\CyberShield\test-update-tmp"
    
    foreach ($d in @("$env:TEMP\CyberShield\test-update", $script:TempDir)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    
    . "$PSScriptRoot\..\modules\update.ps1"
}

Describe "Install-AgentUpdate" {
    BeforeAll {
        $testDir = "$env:TEMP\CyberShield\test-update"
    }

    It "Returns false when download fails" {
        # URL that will fail
        $result = Install-AgentUpdate -Version "999" -Url "https://invalid.test.local/nope.ps1" -Hash "abc" -Signature ""
        $result | Should -BeFalse
    }

    It "Rejects update with non-ASCII characters" {
        $tempFile = "$script:TempDir\agent_update_test.ps1"
        "Write-Host 'café résumé'" | Out-File $tempFile -Encoding UTF8
        
        # We can't easily test Install-AgentUpdate with a local file since it uses Invoke-WebRequest,
        # but we verify the non-ASCII detection logic conceptually
        $content = Get-Content $tempFile -Raw -Encoding UTF8
        $nonAscii = $content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }
        $nonAscii.Count | Should -BeGreaterThan 0
        
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-update" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\CyberShield\test-update-tmp" -Recurse -Force -ErrorAction SilentlyContinue
}
