# CyberShield DNS Filter

Local DNS filtering service for Windows endpoints. Applies security policy enforcement at the DNS level, blocking access to prohibited domains and generating evidence for audit trails.

## Features

- **DNS Filtering**: Blocks queries to prohibited domains with NXDOMAIN response
- **Policy Engine**: Supports exact domain matching and wildcards (`*.tiktok.com`)
- **Evidence Logging**: JSON Lines format for easy parsing and collection
- **Windows Service**: Runs as a background service with automatic recovery
- **Failsafe**: Automatic passthrough mode if upstream DNS is unreachable
- **Hot Reload**: Policy changes are applied without service restart

## Architecture

```
App → OS → 127.0.0.1:53 → CyberShield DNS → Decision → Internet/Block
                              ↓
                        Evidence Log
```

## Installation

### Build from Source

```powershell
# Requires Go 1.21+
cd dns-filter
.\build.ps1 -Release
```

### Install as Service

```powershell
# Run as Administrator
.\bin\cybershield-dns.exe -install
```

### Configure DNS

After installation, configure the system to use `127.0.0.1` as primary DNS:

```powershell
# Example for Ethernet adapter
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses @("127.0.0.1", "1.1.1.1")
```

## Configuration

Configuration file: `C:\ProgramData\CyberShield\dns-config.json`

```json
{
  "listen_addr": "127.0.0.1:53",
  "upstream_dns": "1.1.1.1:53",
  "fallback_dns": "8.8.8.8:53",
  "policy_path": "C:\\ProgramData\\CyberShield\\blocked_websites.json",
  "log_path": "C:\\ProgramData\\CyberShield\\dns_blocked_events.log",
  "health_interval_seconds": 30,
  "query_timeout_ms": 3000,
  "block_ttl_seconds": 60
}
```

## Policy Format

Policy file: `C:\ProgramData\CyberShield\blocked_websites.json`

```json
{
  "version": "2025.12.16",
  "blocked": [
    "facebook.com",
    "*.tiktok.com",
    "instagram.com"
  ],
  "updated_at": "2025-12-16T14:00:00Z"
}
```

### Domain Matching Rules

- `facebook.com` - Blocks `facebook.com` and all subdomains (`www.facebook.com`, `api.facebook.com`)
- `*.tiktok.com` - Explicit wildcard, same behavior as above
- **Important**: `facebook.com` does NOT match `evilfacebook.com` (no false positives)

## Evidence Format

Events are logged in JSON Lines format:

```json
{"ts":"2025-12-16T14:41:22Z","domain":"facebook.com","query_type":"A","pattern":"facebook.com","action":"blocked","source":"dns_query"}
```

## CLI Options

```
cybershield-dns.exe [options]

Options:
  -config string   Path to configuration file
  -service         Run as Windows service
  -install         Install as Windows service
  -uninstall       Uninstall Windows service
  -version         Print version
```

## Service Management

```powershell
# Start service
Start-Service CyberShield-DNS

# Stop service
Stop-Service CyberShield-DNS

# Check status
Get-Service CyberShield-DNS

# View logs
Get-Content C:\ProgramData\CyberShield\logs\dns-filter.log -Tail 50
```

## Uninstallation

```powershell
# Run as Administrator
.\bin\cybershield-dns.exe -uninstall

# Restore original DNS
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ResetServerAddresses
```

## Security Considerations

1. **Privilege Required**: Port 53 requires Administrator/SYSTEM privileges
2. **Failsafe**: If DNS filter crashes, secondary DNS (1.1.1.1) is used automatically
3. **Reversible**: Can be completely removed via `-uninstall` flag
4. **No Internet Blocking**: Passthrough mode ensures internet access even if filter fails

## Integration with CyberShield Agent

This binary is deployed and managed by the CyberShield Agent via:
- `setup_dns_filter` job: Downloads, installs, and configures the DNS filter
- `collect_dns_blocks` job: Collects blocked events and sends to backend
- `remove_dns_filter` job: Completely removes the DNS filter

Evidence flows to `blocked_access_attempts` table with `blocked_by='dns'`.

## License

Copyright (C) CyberShield Security. All rights reserved.
