BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    function Invoke-SecureApi { param([string]$Endpoint, [string]$Method, [hashtable]$Body) return $null }
    
    $script:DataDir = "$env:TEMP\CyberShield\test-selfheal"
    $script:TempDir = "$env:TEMP\CyberShield\test-selfheal-tmp"
    $script:Config = @{
        ScriptPath  = "$env:TEMP\CyberShield\test-selfheal\agent.ps1"
        BackupPath  = "$env:TEMP\CyberShield\test-selfheal\agent.ps1.bak"
    }
    
    foreach ($d in @($script:DataDir, $script:TempDir)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
    
    . "$PSScriptRoot\..\modules\self-heal.ps1"
}

Describe "Get-BOMSafeFileHash" {
    BeforeAll {
        $testDir = "$env:TEMP\CyberShield\test-selfheal"
    }

    It "Returns 64-char lowercase hex hash" {
        $file = "$testDir\test-hash.txt"
        "hello world" | Out-File $file -Encoding UTF8 -NoNewline
        $hash = Get-BOMSafeFileHash -FilePath $file
        $hash.Length | Should -Be 64
        $hash | Should -Match '^[0-9a-f]{64}$'
    }

    It "Strips UTF-8 BOM for consistent hashing" {
        $noBomFile = "$testDir\no-bom.txt"
        $bomFile = "$testDir\with-bom.txt"
        
        $content = [System.Text.Encoding]::UTF8.GetBytes("test content")
        [System.IO.File]::WriteAllBytes($noBomFile, $content)
        
        $bom = [byte[]]@(0xEF, 0xBB, 0xBF)
        $withBom = $bom + $content
        [System.IO.File]::WriteAllBytes($bomFile, $withBom)
        
        $h1 = Get-BOMSafeFileHash -FilePath $noBomFile
        $h2 = Get-BOMSafeFileHash -FilePath $bomFile
        $h1 | Should -Be $h2
    }

    It "Throws for non-existent file" {
        { Get-BOMSafeFileHash -FilePath "$testDir\nonexistent.file" } | Should -Throw
    }
}

Describe "Test-ScriptIntegrity" {
    BeforeAll {
        $testDir = "$env:TEMP\CyberShield\test-selfheal"
    }

    It "Returns false when script file doesn't exist" {
        $result = Test-ScriptIntegrity -ScriptPath "$testDir\not-a-real-file.ps1"
        $result | Should -BeFalse
    }

    It "Returns true and creates cache on first run" {
        $scriptFile = "$testDir\agent.ps1"
        "Write-Host 'test agent'" | Out-File $scriptFile -Encoding UTF8
        
        # Remove cache
        Remove-Item "$testDir\expected_script_hash.json" -Force -ErrorAction SilentlyContinue
        
        $result = Test-ScriptIntegrity -ScriptPath $scriptFile
        $result | Should -BeTrue
        "$testDir\expected_script_hash.json" | Should -Exist
    }

    It "Returns true when hash matches cache" {
        $scriptFile = "$testDir\agent.ps1"
        "Write-Host 'consistent script'" | Out-File $scriptFile -Encoding UTF8
        
        # First call creates cache
        Test-ScriptIntegrity -ScriptPath $scriptFile | Out-Null
        
        # Second call should match
        $result = Test-ScriptIntegrity -ScriptPath $scriptFile
        $result | Should -BeTrue
    }

    It "Returns false when script is tampered" {
        $scriptFile = "$testDir\agent.ps1"
        "Write-Host 'original'" | Out-File $scriptFile -Encoding UTF8
        Test-ScriptIntegrity -ScriptPath $scriptFile | Out-Null
        
        # Tamper the script
        "Write-Host 'tampered'" | Out-File $scriptFile -Encoding UTF8
        
        # Clear boot hash to prevent self-heal
        $Global:BootScriptHash = $null
        
        $result = Test-ScriptIntegrity -ScriptPath $scriptFile
        $result | Should -BeFalse
    }
}

AfterAll {
    Remove-Item "$env:TEMP\CyberShield\test-selfheal" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\CyberShield\test-selfheal-tmp" -Recurse -Force -ErrorAction SilentlyContinue
}
