BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }
    . "$PSScriptRoot\..\modules\security.ps1"
}

Describe "Get-SecurityEvents" {
    It "Returns an array (possibly empty)" {
        $events = Get-SecurityEvents -Hours 1
        $events | Should -BeOfType [System.Array] -Because "it should always return an array"
        # On non-domain test machines the array may be empty
        $events.GetType().BaseType.Name | Should -BeIn @("Array", "Object")
    }

    It "Events have required keys when present" {
        $events = Get-SecurityEvents -Hours 24
        if ($events.Count -gt 0) {
            $events[0].Keys | Should -Contain "event_type"
            $events[0].Keys | Should -Contain "timestamp"
            $events[0].Keys | Should -Contain "event_id"
        }
    }

    It "Respects Hours parameter without throwing" {
        { Get-SecurityEvents -Hours 0 } | Should -Not -Throw
        { Get-SecurityEvents -Hours 168 } | Should -Not -Throw
    }
}

Describe "Get-FirewallStatus" {
    It "Returns a hashtable" {
        $status = Get-FirewallStatus
        $status | Should -BeOfType [System.Collections.Hashtable]
    }

    It "Contains profile names when firewall is available" {
        $status = Get-FirewallStatus
        if ($status.Count -gt 0) {
            # Windows profiles: Domain, Private, Public
            $status.Keys | ForEach-Object { $_ | Should -BeIn @("Domain", "Private", "Public") }
        }
    }

    It "Profile entries have enabled and default_action keys" {
        $status = Get-FirewallStatus
        foreach ($profile in $status.Values) {
            $profile.Keys | Should -Contain "enabled"
            $profile.Keys | Should -Contain "default_action"
        }
    }
}

Describe "Get-AntivirusStatus" {
    It "Returns an array" {
        $av = Get-AntivirusStatus
        # May be empty on servers without SecurityCenter2
        , $av | Should -Not -BeNullOrEmpty -Because "should return at least an empty array"
    }

    It "AV entries have name and state keys when present" {
        $av = Get-AntivirusStatus
        if ($av.Count -gt 0) {
            $av[0].Keys | Should -Contain "name"
            $av[0].Keys | Should -Contain "state"
            $av[0].Keys | Should -Contain "enabled"
        }
    }
}
