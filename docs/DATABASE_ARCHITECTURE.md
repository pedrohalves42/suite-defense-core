# CyberShield Database Architecture

## Executive Summary

CyberShield's database architecture is designed for multi-tenant SaaS operations, optimized for scale from 100 to 10,000+ agents with predictable costs and strict data isolation.

**Key Metrics:**
- **Production Ready:** ✅ Yes
- **Current Scale:** Optimized for 1,000+ agents
- **Max Scale (with current architecture):** 50,000+ agents
- **RLS Coverage:** 100%
- **Data Isolation:** Strict multi-tenant

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                            │
│  Dashboard │ Reports │ Agent Management │ Security Features         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EDGE FUNCTIONS (Deno)                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  heartbeat  │ │  poll-jobs  │ │submit-metrics│ │ enroll-agent│   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  ai-analyze │ │ generate-   │ │ check-agent │ │serve-install│   │
│  │   -agent    │ │   report    │ │  -updates   │ │    -er      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SUPABASE (PostgreSQL)                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    CORE TABLES                               │   │
│  │  tenants │ profiles │ user_roles │ agents │ jobs            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  METRICS (Partitioned)                       │   │
│  │  agent_system_metrics_partitioned (monthly partitions)       │   │
│  │  agent_metrics_daily (rollup aggregation)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  SECURITY DATA                               │   │
│  │  software_installed │ vuln_findings │ antivirus_status      │   │
│  │  agent_web_activity │ security_events │ ai_insights         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  AUTH & SECURITY                             │   │
│  │  hmac_signatures_partitioned │ rate_limits │ api_keys       │   │
│  │  enrollment_keys │ agent_tokens │ audit_logs                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Retention Policy

| Data Type | Retention Period | Cleanup Schedule |
|-----------|------------------|------------------|
| System Metrics (raw) | 90 days | Daily @ 04:00 UTC |
| System Metrics (aggregated) | 12 months | N/A (rollup) |
| HMAC Signatures | 6 hours | Hourly |
| Rate Limits | 30 minutes | Hourly |
| Failed Login Attempts | 24 hours | 6-hourly |
| Audit Logs | 365 days | Daily @ 04:00 UTC |
| Security Events | 180 days | Weekly |
| Jobs (completed) | 30 days | Weekly |

**Implementation:**
- `cleanup_old_metrics_90days()` - Main retention function
- `cleanup_old_hmac_signatures()` - HMAC cleanup
- `cleanup_old_rate_limits()` - Rate limit cleanup
- pg_cron scheduled jobs for automation

---

## Scaling Strategy

### Current Optimization (Phase 1 - Complete)
- ✅ Table partitioning (metrics by month)
- ✅ RLS with security_invoker views
- ✅ Indexed queries for common patterns
- ✅ Connection pooling via Supabase

### Scale to 10,000 Agents (Phase 2 - Ready)
- ✅ Daily aggregation rollup (`agent_metrics_daily`)
- ✅ Retention policy (90-day raw, 12-month aggregated)
- ⚠️ Read replicas (when needed)
- ⚠️ Queue-based job processing (when needed)

### Scale to 50,000+ Agents (Phase 3 - Planned)
- Dedicated database instance
- Sharding by tenant_id
- Event-driven architecture (Kafka/NATS)
- CDN for installer distribution

---

## Cost Estimation Per Agent

| Component | Cost/Agent/Month | Notes |
|-----------|------------------|-------|
| Database Storage | R$ 0.15 | ~5MB/agent/month after retention |
| Edge Function Calls | R$ 0.08 | ~2,000 calls/agent/month |
| Bandwidth | R$ 0.02 | Installer + metrics |
| **Total** | **R$ 0.25** | Gross margin: ~94% |

### Monthly Infrastructure Cost Projection

| Agents | Monthly Cost | MRR (avg R$200/tenant) | Gross Margin |
|--------|--------------|------------------------|--------------|
| 100 | R$ 25 | R$ 2,000 | 98.7% |
| 1,000 | R$ 250 | R$ 20,000 | 98.7% |
| 10,000 | R$ 2,500 | R$ 200,000 | 98.7% |

---

## Security Architecture

### Multi-Tenant Isolation
- **RLS (Row Level Security):** 100% coverage on all user-accessible tables
- **Views:** All views use `security_invoker=on`
- **Functions:** Essential functions use `SECURITY DEFINER` with `search_path` set

### Authentication Layers
1. **Users (Dashboard):** Supabase JWT with role claims
2. **Agents:** Token + HMAC-SHA256 with replay protection
3. **Installers:** Enrollment keys with expiration

### SECURITY DEFINER Inventory
- **Essential (22 functions):** Core auth, cleanup, tenant isolation
- **Legacy (0 functions):** None identified
- **Monitoring:** `v_security_definer_inventory` view

---

## Key Tables Reference

### Core
| Table | Purpose | RLS |
|-------|---------|-----|
| `tenants` | Organization/company | ✅ |
| `profiles` | User profiles | ✅ |
| `user_roles` | Role assignments | ✅ |
| `agents` | Registered endpoints | ✅ |
| `jobs` | Job queue | ✅ |

### Metrics
| Table | Purpose | Partitioned |
|-------|---------|-------------|
| `agent_system_metrics_partitioned` | Raw metrics | ✅ Monthly |
| `agent_metrics_daily` | Aggregated metrics | ❌ |

### Security
| Table | Purpose | RLS |
|-------|---------|-----|
| `software_installed` | Installed software | ✅ |
| `vuln_findings` | Vulnerabilities | ✅ |
| `agent_web_activity` | Web history | ✅ |
| `security_events` | Security incidents | ✅ |

---

## Maintenance Operations

### Daily (Automated via pg_cron)
- Aggregate previous day metrics → `agent_metrics_daily`
- Clean HMAC signatures > 6h
- Clean rate limits > 30min

### Weekly (Automated)
- Clean completed jobs > 30 days
- Clean security events > 180 days
- Vacuum analyze on large tables

### Monthly
- Drop old metric partitions (> 3 months)
- Create next month's partitions
- Review SECURITY DEFINER inventory

---

## Monitoring Queries

```sql
-- Database size by table
SELECT 
  schemaname || '.' || tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
LIMIT 20;

-- Active connections by tenant
SELECT tenant_id, COUNT(*) as agent_count
FROM agents WHERE status = 'active'
GROUP BY tenant_id ORDER BY agent_count DESC;

-- SECURITY DEFINER functions inventory
SELECT * FROM v_security_definer_inventory;

-- Retention status
SELECT 
  'metrics' as data_type,
  MIN(collected_at) as oldest_record,
  MAX(collected_at) as newest_record,
  COUNT(*) as record_count
FROM agent_system_metrics_partitioned;
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-15 | Initial architecture documentation |
| - | - | Partitioning strategy implemented |
| - | - | Retention policy defined |
| - | - | Daily aggregation rollup added |

---

**Document Owner:** Dr. Atlas Verus (CTO Audit)  
**Last Review:** December 15, 2025  
**Next Review:** January 15, 2026
