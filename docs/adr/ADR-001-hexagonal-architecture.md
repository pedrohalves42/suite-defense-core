# ADR-001: Hexagonal Architecture for Agent Update System

**Status:** Accepted  
**Date:** 2026-02-12  
**Deciders:** Engineering Team

## Context

The agent update system evolved organically across multiple Edge Functions (`serve-agent-update`, `heartbeat`, `process-agent-updates`, `check-agent-updates`), resulting in:

- **Duplicated logic**: Version normalization, SHA256 calculation, and Windows line-ending normalization were copy-pasted across functions.
- **Monolithic functions**: `serve-agent-update` grew to ~500 lines mixing HTTP handling, authentication, business logic, and database queries.
- **No testability**: Domain logic was intertwined with Supabase calls, making unit testing impossible without full infrastructure.

## Decision

We adopted **Hexagonal Architecture** (Ports & Adapters) with a Deno-compatible shared module layer:

```
supabase/functions/_shared/hexagonal/
├── types.ts                    # Domain enums and interfaces
├── ports.ts                    # Output port interfaces
├── adapters.ts                 # Supabase implementations of ports
├── use-cases.ts                # Business orchestration (ProcessAgentUpdatesUseCase)
├── update-decision-service.ts  # Pure domain service (version/hotfix decisions)
├── index.ts                    # Barrel export
└── __tests__/                  # Deno-native unit tests
    ├── update-decision-service.test.ts
    └── use-cases.test.ts
```

Additionally, a **frontend Domain Layer** exists at:

```
src/domain/
├── entities/          # AgentUpdate, UpdatePackage (FSM, lifecycle)
├── value-objects/     # AgentId, AgentVersion, UpdateChecksum, etc.
├── shared/            # ValueObject base, Result monad, DomainError
└── constants.ts       # UpdateStatus enum

src/infrastructure/
└── mappers/           # AgentUpdateMapper, UpdatePackageMapper (DB ↔ Domain)
```

## Architecture Layers

### 1. Domain Layer (Pure Logic)
- **UpdateDecisionService**: Determines upgrade/hotfix/no_update decisions via version normalization and SHA256 comparison.
- **Entities**: `AgentUpdate` (FSM with state transitions), `UpdatePackage` (signing, version constraints).
- **Value Objects**: Immutable, validated (`AgentId`, `UpdateChecksum`, `AgentVersion` with SemVer).

### 2. Application Layer (Use Cases)
- **ProcessAgentUpdatesUseCase**: Orchestrates cron-based automated rollout by composing ports.
- Dependencies injected via constructor (pure DI, no framework).

### 3. Infrastructure Layer (Adapters)
- **SupabaseVersionQueryAdapter**: Queries `agent_versions` and `agents` tables.
- **SupabaseUpdateJobAdapter**: Creates `jobs` records, sets `force_update_version`.
- **SupabaseObservabilityAdapter**: Logs job runs via `log_scheduled_job_run` RPC.
- **LoggingEventDispatcherAdapter**: Structured domain event logging.

### 4. Presentation Layer (Edge Functions)
- **process-agent-updates**: Thin HTTP handler composing hexagonal dependencies (~80 lines).
- **serve-agent-update**: Uses `updateDecisionService.evaluate()` for version/hotfix decisions.
- **heartbeat**: Uses `normalizeVersion()` for force-update version comparison.
- **check-agent-updates**: Uses `normalizeVersion()` for accurate `has_update` comparison.

## Key Design Decisions

### Deno/Vite Boundary
Edge Functions run in Deno and cannot use Vite path aliases (`@/domain/...`). We maintain two parallel module trees:
- `src/domain/` — Frontend (Vite, `@/` imports)
- `supabase/functions/_shared/hexagonal/` — Backend (Deno, relative `.ts` imports)

### Gradual Integration
Existing Edge Functions were not rewritten wholesale. Instead:
1. Shared services were extracted to `_shared/hexagonal/`.
2. Functions import and delegate to these services.
3. Legacy compatibility (HMAC fallback, token-only auth) remains in the Edge Functions.

### Test Strategy
- **Domain Layer**: 45+ Vitest unit tests (entities, value objects, FSM transitions).
- **Infrastructure Layer**: 19+ Vitest tests (mappers, DB ↔ domain roundtrip).
- **Hexagonal Deno Layer**: Deno-native tests with in-memory test doubles (no Supabase dependency).

## Consequences

### Positive
- **Single source of truth**: Version normalization and SHA256 logic exist in one place.
- **Testability**: Use cases can be tested with fake ports, no infrastructure needed.
- **Maintainability**: Adding a new platform or update channel requires only a new adapter, not modifying core logic.

### Negative
- **Module duplication**: Domain concepts exist in both `src/domain/` and `_shared/hexagonal/` due to Deno/Vite boundary.
- **Learning curve**: Contributors must understand ports/adapters pattern.

## References
- [Hexagonal Architecture (Alistair Cockburn)](https://alistair.cockburn.us/hexagonal-architecture/)
- [Domain-Driven Design (Eric Evans)](https://domainlanguage.com/ddd/)
