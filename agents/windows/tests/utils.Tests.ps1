BeforeAll {
    . "$PSScriptRoot\..\modules\utils.ps1"
}

Describe "Write-Log" {
    BeforeAll {
        $script:LogDir = "$env:TEMP\CyberShield\test-logs"
        $script:LogFile = $null
        if (-not (Test-Path $script:LogDir)) { New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null }
    }

    It "Creates log directory if not exists" {
        $script:LogDir = "$env:TEMP\CyberShield\test-logs-new"
        $script:LogFile = $null
        Write-Log "test message" "INFO"
        $script:LogDir | Should -Exist
    }

    It "Creates log file with date pattern" {
        $script:LogFile = $null
        Write-Log "test" "INFO"
        $script:LogFile | Should -Not -BeNullOrEmpty
        $script:LogFile | Should -Exist
    }

    It "Writes message to log file" {
        $script:LogFile = "$env:TEMP\CyberShield\test-logs\test.log"
        Write-Log "unique-test-string-42" "INFO"
        Get-Content $script:LogFile -Raw | Should -Match "unique-test-string-42"
    }

    It "Includes level in log output" {
        $script:LogFile = "$env:TEMP\CyberShield\test-logs\level-test.log"
        Write-Log "level test" "ERROR"
        Get-Content $script:LogFile -Raw | Should -Match "\[ERROR\]"
    }

    AfterAll {
        Remove-Item "$env:TEMP\CyberShield\test-logs" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item "$env:TEMP\CyberShield\test-logs-new" -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Describe "Test-CommandExists" {
    It "Returns true for existing command" {
        Test-CommandExists "Get-Process" | Should -BeTrue
    }

    It "Returns false for non-existing command" {
        Test-CommandExists "NonExistent-FakeCommand-12345" | Should -BeFalse
    }
}
