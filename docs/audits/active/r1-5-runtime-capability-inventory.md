# R1.5 — Runtime Capability Inventory (READ-ONLY)

## Provenance

- **Collected at:** `2026-07-02 13:42:55Z`
- **Commit SHA:** `b5b690940087a9eb280b9e86ff86f311a5b16081`
- **Migration head:** `20260701202145_658758a3-ab66-45ba-9d9e-2cc20c06abf2.sql`
- **Edge Functions scanned:** 74
- **Shared helpers scanned:** 87 files under `supabase/functions/_shared/`
- **Generator:** `tools/reports/runtime_capability_inventory.py`
- **Scope:** static analysis only. No runtime, no DB, no code changes.

## Question this report answers

> How much of the R2 reliability work can be resolved centrally
> (1 middleware / 1 helper) instead of touching 74 functions?

## Executive summary — reliability capabilities vs. shared helpers

For each capability flagged by R1, we ask: does a shared helper already exist,
and how many functions already import it (union across candidates)?

| Capability (from R1 gaps) | Shared helper(s) | Functions already using | Not yet covered |
|---------------------------|------------------|------------------------:|----------------:|
| fetch timeout | `_shared/fetch-with-timeout.ts`, `_shared/timeout.ts` | 15 / 74 | 59 |
| retry / backoff | — (no shared helper exists) | 0 / 74 | 74 |
| circuit breaker | `_shared/ai-circuit-breaker.ts` | 0 / 74 | 74 |
| structured logger | `_shared/logger.ts` | 70 / 74 | 4 |
| correlation / request-id context | `_shared/request-context.ts`, `_shared/serve-tenant.ts`, `_shared/serve-public.ts`, `_shared/serve-internal.ts`, `_shared/serve-agent.ts` | 72 / 74 | 2 |
| APM / metrics | `_shared/apm.ts` | 2 / 74 | 72 |
| audit logging | `_shared/audit.ts` | 7 / 74 | 67 |
| rate limiting | `_shared/rate-limit-middleware.ts`, `_shared/rate-limit.ts` | 4 / 74 | 70 |
| standardized error handling | `_shared/error-handler.ts` | 10 / 74 | 64 |
| tenant assertion | `_shared/validate-caller-tenant.ts`, `_shared/serve-tenant.ts` | 54 / 74 | 20 |
| idempotency | — (no shared helper exists) | 0 / 74 | 74 |

> Reading key: a capability with an existing helper and low fan-in is a
> **centralization candidate** — the helper already exists; the follow-up is
> to route more functions through it, not to write new code per function.
> A capability with no shared helper at all (`—`) is a **greenfield decision**
> for R2 authorization.

## Top-15 highest fan-in helpers (leverage ranking)

Helpers with the largest fan-in are the natural insertion points for
cross-cutting concerns — any code added there is inherited by every importer.

| Rank | Helper | Fan-in | Exports (first 4) |
|-----:|--------|-------:|-------------------|
| 1 | `_shared/logger.ts` | **70** / 74 | `LogContext`, `logger`, `loggerWithContext` |
| 2 | `_shared/serve-tenant.ts` | **52** / 74 | `RateLimitOption`, `ServeOptions`, `TenantContext`, `serveAgent` (+3) |
| 3 | `_shared/cors.ts` | **26** / 74 | `buildCorsHeaders`, `corsHeaders` |
| 4 | `_shared/database.types.ts` | **22** / 74 | `CompositeTypes`, `Constants`, `Database`, `Enums` (+4) |
| 5 | `_shared/serve-public.ts` | **15** / 74 | `PublicContext`, `PublicHandler`, `ServePublicOptions`, `servePublic` |
| 6 | `_shared/fetch-with-timeout.ts` | **14** / 74 | `TIMEOUT_TIERS`, `fetchWithTimeout` |
| 7 | `_shared/ai-provider-helper.ts` | **10** / 74 | `AICallOptions`, `AICallResult`, `callAI`, `callAIJson` (+3) |
| 8 | `_shared/error-handler.ts` | **10** / 74 | `ErrorCode`, `ErrorContext`, `StandardError`, `corsHeaders` (+8) |
| 9 | `_shared/audit.ts` | **7** / 74 | `CreateAuditLogParams`, `createAuditLog` |
| 10 | `_shared/env.ts` | **7** / 74 | `getSupabaseConfig`, `getSupabaseFullConfig`, `optionalEnv`, `requireEnv` |
| 11 | `_shared/validation.ts` | **7** / 74 | `AcknowledgeAlertPayloadSchema`, `AgentNameSchema`, `AgentTokenSchema`, `AutoGenerateEnrollmentSchema` (+24) |
| 12 | `_shared/assert-internal-caller.ts` | **6** / 74 | `assertInternalCaller` |
| 13 | `_shared/json.ts` | **6** / 74 | `asJson`, `toRecord` |
| 14 | `_shared/security-log.ts` | **5** / 74 | `SecurityLogParams`, `checkIpBlocklist`, `extractIpAddress`, `logSecurityEvent` |
| 15 | `_shared/ai-prompt-registry.ts` | **4** / 74 | `AIPromptRegistry`, `getSystemPrompt`, `logPromptUsage` |

## Full helper inventory by capability

### Request lifecycle / middleware

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/serve-tenant.ts` | 52 / 74 | `RateLimitOption`, `ServeOptions`, `TenantContext`, `serveAgent` (+3) |
| `_shared/serve-public.ts` | 15 / 74 | `PublicContext`, `PublicHandler`, `ServePublicOptions`, `servePublic` |
| `_shared/error-handler.ts` | 10 / 74 | `ErrorCode`, `ErrorContext`, `StandardError`, `corsHeaders` (+8) |
| `_shared/serve-agent.ts` | 4 / 74 | `AgentContext`, `AgentHandler`, `ServeAgentOptions`, `serveAgent` |
| `_shared/http.ts` | 2 / 74 | `HttpError`, `HttpRequestOptions`, `httpJson` |
| `_shared/security-headers.ts` | 1 / 74 | `corsSecurityHeaders`, `htmlSecurityHeaders`, `secureCorsPreflightResponse`, `secureErrorResponse` (+2) |
| `_shared/serve-honeypot.ts` | 1 / 74 | `HoneypotContext`, `HoneypotHandler`, `serveHoneypot` |
| `_shared/serve-internal.ts` | 1 / 74 | `InternalContext`, `InternalHandler`, `serveInternal` |
| `_shared/http-method-validator.ts` | 0 / 74 | `HttpMethod`, `handleCorsPreflightRequest`, `validateHttpMethod` |
| `_shared/rate-limit-middleware.ts` | 0 / 74 | `RateLimitMiddlewareConfig`, `applyRateLimit`, `enforceRateLimit`, `extractIdentifier` |
| `_shared/request-context.ts` | 0 / 74 | `RequestContext`, `createRequestContext`, `getResponseHeaders`, `mergeHeaders` |

### HTTP client / timeout / retry

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/fetch-with-timeout.ts` | 14 / 74 | `TIMEOUT_TIERS`, `fetchWithTimeout` |
| `_shared/timeout.ts` | 4 / 74 | `TimeoutOptions`, `createTimeoutResponse`, `withTimeout` |

### Logging / observability

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/logger.ts` | 70 / 74 | `LogContext`, `logger`, `loggerWithContext` |
| `_shared/security-log.ts` | 5 / 74 | `SecurityLogParams`, `checkIpBlocklist`, `extractIpAddress`, `logSecurityEvent` |
| `_shared/health-probe.ts` | 3 / 74 | `EDGE_BUILD_TIMESTAMP`, `EDGE_VERSION`, `addHealthHeaders`, `emergencyModeResponse` (+7) |
| `_shared/apm.ts` | 2 / 74 | `APMMetric`, `recordMetric`, `withAPM` |
| `_shared/build-telemetry.ts` | 1 / 74 | `BuildTelemetry`, `BuildTelemetryEvent` |
| `_shared/installer-telemetry.ts` | 1 / 74 | `persistInstallerHash`, `trackDownloadEvent` |
| `_shared/sanitize-log.ts` | 0 / 74 | `sanitizeForLog` |

### Auth / tenant / caller identity

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/assert-internal-caller.ts` | 6 / 74 | `assertInternalCaller` |
| `_shared/tenant.ts` | 2 / 74 | `getTenantIdForUser`, `getValidatedTenantId`, `verifyUserTenant` |
| `_shared/validate-caller-tenant.ts` | 2 / 74 | `validateCallerTenant` |
| `_shared/agent-auth.ts` | 1 / 74 | `AgentAuthResult`, `AgentExtraField`, `AuthenticateAgentOptions`, `AuthenticatedAgent` (+1) |
| `_shared/require-super-admin.ts` | 1 / 74 | `SuperAdminAuthResult`, `requireSuperAdmin` |
| `_shared/api-auth.ts` | 0 / 74 | `ApiAuthResult`, `authenticateApiKey`, `hasScope`, `logApiRequest` |
| `_shared/ip-allowlist.ts` | 0 / 74 | `enforceIPAllowlist`, `extractClientIP` |

### Audit / compliance

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/audit.ts` | 7 / 74 | `CreateAuditLogParams`, `createAuditLog` |

### Data / persistence

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/database.types.ts` | 22 / 74 | `CompositeTypes`, `Constants`, `Database`, `Enums` (+4) |
| `_shared/rate-limit.ts` | 4 / 74 | `checkRateLimit`, `getRateLimitCacheStats` |
| `_shared/job-insert.ts` | 3 / 74 | `JobInsertRow`, `jobInsert`, `jobInsertMany` |
| `_shared/supabase-client.ts` | 3 / 74 | `createClientFromRequest`, `createSupabaseClient`, `getServiceClient` |
| `_shared/dlq.ts` | 2 / 74 | `DLQEntry`, `DLQResult`, `calculateNextRetry`, `getDLQEntriesForRetry` (+3) |
| `_shared/quota.ts` | 1 / 74 | `checkQuotaAvailable` |
| `_shared/batch.ts` | 0 / 74 | `SupabaseClientLike`, `batchFetchByIds`, `batchQuery`, `batchUpsert` |
| `_shared/cache.ts` | 0 / 74 | `CacheOptions`, `cleanupExpiredCache`, `getAgentsByTenant`, `getCached` (+7) |
| `_shared/kv-cache.ts` | 0 / 74 | `cacheDelete`, `cacheGet`, `cacheGetOrSet`, `cacheSet` |

### Crypto / signing / HMAC

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/crypto-utils.ts` | 4 / 74 | `createCanonicalPayload`, `signJob`, `signPayload`, `timingSafeEqual` (+1) |
| `_shared/token-hash.ts` | 4 / 74 | `getTokenPrefix`, `hashToken`, `validateTokenHash` |
| `_shared/script-resigner.ts` | 3 / 74 | `ResignResult`, `resignIfNeeded` |
| `_shared/hmac.ts` | 2 / 74 | `AuthFailureContext`, `HmacVerificationResult`, `generateHmacSecret`, `timingSafeEqual` (+1) |
| `_shared/ed25519-public-key.ts` | 1 / 74 | `getEd25519PublicKeyBase64` |
| `_shared/rsa-public-key.ts` | 1 / 74 | `getRsaPublicKeyBase64`, `signWithRsa` |
| `_shared/verify-result-signature.ts` | 1 / 74 | `SignatureVerificationResult`, `computeOutputHash`, `verifyResultSignature` |
| `_shared/hmac-success-coalescer.ts` | 0 / 74 | `CoalescerOptions`, `FormatCacheUpsertRow`, `_flushForTests`, `_resetCoalescerForTests` (+3) |

### Circuit breaker

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/ai-circuit-breaker.ts` | 0 / 74 | `AICallOptions`, `CircuitBreakerState`, `executeWithTimeout`, `getCircuitState` (+4) |

### Validation / sanitization / errors

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/validation.ts` | 7 / 74 | `AcknowledgeAlertPayloadSchema`, `AgentNameSchema`, `AgentTokenSchema`, `AutoGenerateEnrollmentSchema` (+24) |
| `_shared/json.ts` | 6 / 74 | `asJson`, `toRecord` |
| `_shared/json-parser.ts` | 2 / 74 | `FallbackAuditResult`, `FallbackRedTeamResult`, `createFallbackAudit`, `createFallbackRedTeam` (+3) |
| `_shared/html-escape.ts` | 1 / 74 | `escapeHtml` |
| `_shared/installer-validation.ts` | 1 / 74 | `validateInstallerScript`, `validateNoPlaceholders` |
| `_shared/sanitize.ts` | 1 / 74 | `sanitizeErrorMessage`, `sanitizeForStorage`, `sanitizeJobOutput`, `sanitizeObject` |
| `_shared/errors.ts` | 0 / 74 | `AuthenticationError`, `AuthorizationError`, `ConflictError`, `CyberShieldError` (+4) |

### Other

| Helper | Fan-in | Exports (first 4) |
|--------|-------:|-------------------|
| `_shared/cors.ts` | 26 / 74 | `buildCorsHeaders`, `corsHeaders` |
| `_shared/ai-provider-helper.ts` | 10 / 74 | `AICallOptions`, `AICallResult`, `callAI`, `callAIJson` (+3) |
| `_shared/env.ts` | 7 / 74 | `getSupabaseConfig`, `getSupabaseFullConfig`, `optionalEnv`, `requireEnv` |
| `_shared/ai-prompt-registry.ts` | 4 / 74 | `AIPromptRegistry`, `getSystemPrompt`, `logPromptUsage` |
| `_shared/agent-script-preparation.ts` | 3 / 74 | `PersistableSupabaseLike`, `PreparedAgentScript`, `maybeDecodeScriptContent`, `prepareAgentScriptContent` |
| `_shared/feature-flags.ts` | 3 / 74 | `FeatureFlagOptions`, `isFeatureEnabled`, `isKillSwitchEnabled` |
| `_shared/ai-evidence-types.ts` | 2 / 74 | `AIEvidence`, `AIEvidencePack`, `AIResponseWithEvidence`, `buildEvidence` (+3) |
| `_shared/ai-multi-provider.ts` | 2 / 74 | `aiComplete`, `aiJsonComplete`, `aiSimpleComplete`, `getActiveProviders` (+4) |
| `_shared/ai-sanitizer.ts` | 2 / 74 | `anonymizeAgentName`, `estimateTokenCount`, `logAnomaly`, `processAnomalies` (+5) |
| `_shared/business-hours.ts` | 2 / 74 | `BusinessHoursConfig`, `getTenantBusinessHours`, `isWithinBusinessHours`, `shouldProcessAlertsForTenant` |
| `_shared/ai-quality-monitor.ts` | 1 / 74 | `DriftAlert`, `QualityCheckResult`, `checkForHallucination`, `createQualityAlert` (+3) |
| `_shared/installer-agent-resolver.ts` | 1 / 74 | `resolveAgent` |
| `_shared/installer-script-builder.ts` | 1 / 74 | `buildInstallerScript` |
| `_shared/installer-version.ts` | 1 / 74 | `CHANGES`, `INSTALLER_VERSION`, `INSTALLER_VERSION_LINUX`, `INSTALLER_VERSION_MACOS` (+3) |
| `_shared/protected-targets.ts` | 1 / 74 | `PROTECTED_PROCESSES`, `PROTECTED_SERVICES`, `assertNotProtected`, `isProcessProtected` (+1) |
| `_shared/agent-script-content.ts` | 0 / 74 | `SCRIPT_VERSION` |
| `_shared/agent-script-validator.ts` | 0 / 74 | `calculateScriptHash`, `validateAgentScript`, `validateAgentScriptContent`, `validateAgentScriptOrThrow` |
| `_shared/agent-script-windows.ts` | 0 / 74 | `WINDOWS_AGENT_SCRIPT_SOURCE` |
| `_shared/ai-anomaly-detector.ts` | 0 / 74 | `AIContext`, `AIResponse`, `AnomalyFlag`, `BehaviorValidation` (+4) |
| `_shared/ai-metrics.ts` | 0 / 74 | `AIInferenceMetrics`, `createMetricsLogger`, `extractTokenUsage`, `logAIMetrics` (+1) |
| `_shared/ai-metrics-persistence.ts` | 0 / 74 | `cleanupOldAIMetrics`, `getAIMetricsSummary`, `persistAIMetrics`, `persistAIMetricsBatch` |
| `_shared/ai-multi-provider-types.ts` | 0 / 74 | `AICompletionRequest`, `AICompletionResponse`, `AIMessage`, `AIProviderConfig` (+3) |
| `_shared/ai-provider-configs.ts` | 0 / 74 | `PROVIDERS` |
| `_shared/ai-provider-routing.ts` | 0 / 74 | `calculateProviderScore`, `getAvailableProviders`, `isProviderAvailable`, `providerCircuits` (+7) |
| `_shared/domain-events.ts` | 0 / 74 | `EdgeDomainEvent`, `EdgeDomainEventDispatcher` |
| `_shared/insight-action-mapping.ts` | 0 / 74 | `InsightActionMapping`, `InsightExecutionMode`, `InsightRiskLevel`, `getActionLabel` (+4) |
| `_shared/installer-template.ts` | 0 / 74 | `LINUX_INSTALLER_TEMPLATE_V3`, `LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED`, `MACOS_INSTALLER_TEMPLATE_V3`, `MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED` (+1) |
| `_shared/installer-template-envvars.ts` | 0 / 74 | `LINUX_INSTALLER_TEMPLATE_V3_ENVVARS`, `MACOS_INSTALLER_TEMPLATE_V3_ENVVARS` |
| `_shared/installer-template-linux.ts` | 0 / 74 | `LINUX_INSTALLER_TEMPLATE_V3`, `LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED` |
| `_shared/installer-template-macos.ts` | 0 / 74 | `MACOS_INSTALLER_TEMPLATE_V3`, `MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED` |
| `_shared/installer-template-windows.ts` | 0 / 74 | `WINDOWS_INSTALLER_TEMPLATE` |
| `_shared/installer-types.ts` | 0 / 74 | `AgentData`, `EnrollmentData`, `InstallerContext` |
| `_shared/webhook-utils.ts` | 0 / 74 | `WebhookPayload`, `detectWebhookProvider`, `sendWebhookAlert` |
| `_shared/windows-script-hotfix.ts` | 0 / 74 | `applyWindowsScriptHotfix` |

## Fan-in distribution

| Bucket | Helpers |
|--------|--------:|
| 0 importers (unused / test-only) | 31 |
| 1–5 importers (narrow) | 43 |
| 6–20 importers (medium) | 9 |
| 21+ importers (broad / central) | 4 |

### Helpers with 0 importers (31)

Listed for visibility only. No action recommended in R1.5.

`agent-script-content`, `agent-script-validator`, `agent-script-windows`, `ai-anomaly-detector`, `ai-circuit-breaker`, `ai-metrics`, `ai-metrics-persistence`, `ai-multi-provider-types`, `ai-provider-configs`, `ai-provider-routing`, `api-auth`, `batch`, `cache`, `domain-events`, `errors`, `hmac-success-coalescer`, `http-method-validator`, `insight-action-mapping`, `installer-template`, `installer-template-envvars`, `installer-template-linux`, `installer-template-macos`, `installer-template-windows`, `installer-types`, `ip-allowlist`, `kv-cache`, `rate-limit-middleware`, `request-context`, `sanitize-log`, `webhook-utils`, `windows-script-hotfix`


## Which functions import the most shared helpers?

A high count here means the function is already leaning on shared
infrastructure — instrumenting the shared helpers benefits these functions
first, with zero per-function change.

| Function | Helpers imported |
|----------|-----------------:|
| `public-gateway` | 23 |
| `api-gateway` | 18 |
| `ops-gateway` | 17 |
| `ai-full-audit` | 10 |
| `heartbeat` | 10 |
| `ai-router` | 9 |
| `auto-generate-enrollment` | 9 |
| `build-agent-exe` | 9 |
| `poll-jobs` | 9 |
| `ai-system-audit` | 8 |
| `submit-job-result` | 8 |
| `enroll-agent` | 7 |
| `ai-analyze-agent` | 6 |
| `ai-system-analyzer` | 6 |
| `ops-checks` | 6 |

## Methodology (honest limits)

- **Fan-in** = number of Edge Function directories whose `.ts` files contain
  `from '…/_shared/<stem>' | '…/_shared/<stem>.ts'`. Counts one per function
  directory, not per file.
- **Exports** are extracted via regex over `export function|class|const|let|var|type|interface|enum` and `export { … }` lists.
- **Capability grouping** in this report is manual (see `CAPABILITY_MAP` in
  the generator). It reflects intent, not automatic classification.
- **Not measured:** call-site depth, dynamic imports, indirect re-exports,
  runtime dispatch. A helper flagged as unused might still be wired via a
  re-export barrel; verify before archiving.
- **What this report does not do:** rank functions, propose middleware
  changes, propose consolidation, or open follow-up blocks.

## R1.5 closure contract

Deliverables authorized for this block, all present in this artifact:
- ✅ Every shared helper listed with its exports.
- ✅ Fan-in per helper (who imports each).
- ✅ Capability coverage table (which R1 gaps already have a helper, and how
  many functions currently route through it).
- ✅ Leverage ranking (top-15 highest fan-in helpers).
- ✅ Explicit methodology and limits.

**Not included (out of scope):** proposals for centralization, PRs,
middleware changes, R2 planning. The Reliability Score remains blocked.
