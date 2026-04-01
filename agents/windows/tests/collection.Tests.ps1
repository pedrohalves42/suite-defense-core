BeforeAll {
    function Write-Log { param([string]$Message, [string]$Level) }

    $script:Config = @{
        AgentId  = "test-agent-id"
        TenantId = "test-tenant-id"
    }

    . "$PSScriptRoot\..\modules\collection.ps1"
}

Describe "Invoke-CollectSoftwareInventory" {
    It "Returns a hashtable with software_count" {
        $result = Invoke-CollectSoftwareInventory
        $result | Should -BeOfType [hashtable]
        $result.Keys | Should -Contain "software_count"
        $result.Keys | Should -Contain "collected_at"
    }

    It "Limits software_list to 500 entries" {
        $result = Invoke-CollectSoftwareInventory
        $result.software_list.Count | Should -BeLessOrEqual 500
    }
}

Describe "Invoke-CollectAntivirusStatus" {
    It "Returns a hashtable with antivirus_products" {
        $result = Invoke-CollectAntivirusStatus
        $result | Should -BeOfType [hashtable]
        $result.Keys | Should -Contain "antivirus_products"
        $result.Keys | Should -Contain "count"
        $result.Keys | Should -Contain "collected_at"
    }
}

Describe "Invoke-CollectNetworkInfo" {
    It "Returns a hashtable with collected_at" {
        $result = Invoke-CollectNetworkInfo
        $result | Should -BeOfType [hashtable]
        $result.Keys | Should -Contain "collected_at"
    }

    It "Contains firewall status fields" {
        $result = Invoke-CollectNetworkInfo
        $result.Keys | Should -Contain "firewall_domain"
        $result.Keys | Should -Contain "firewall_private"
        $result.Keys | Should -Contain "firewall_public"
    }
}

Describe "Invoke-CollectDnsBlocks" {
    It "Returns blocked domains from hosts file" {
        $result = Invoke-CollectDnsBlocks
        $result | Should -BeOfType [hashtable]
        $result.Keys | Should -Contain "blocked_domains"
        $result.Keys | Should -Contain "count"
    }
}

Describe "Extract-DomainFromUrl" {
    It "Extracts domain from https URL" {
        $result = Extract-DomainFromUrl -url "https://www.example.com/path"
        $result | Should -Be "www.example.com"
    }

    It "Extracts domain from http URL" {
        $result = Extract-DomainFromUrl -url "http://test.org/page"
        $result | Should -Be "test.org"
    }

    It "Returns null for empty string" {
        $result = Extract-DomainFromUrl -url ""
        $result | Should -BeNullOrEmpty
    }

    It "Returns null for invalid URL" {
        $result = Extract-DomainFromUrl -url "not-a-url"
        $result | Should -BeNullOrEmpty
    }
}
