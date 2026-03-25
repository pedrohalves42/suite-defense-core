/**
 * Job FSM Transition Diagram (Mermaid)
 * 
 * Generated from domain analysis of src/domain/entities/Job.ts
 * and the DB trigger `trg_enforce_job_state_transitions`.
 * 
 * All 9 states are ACTIVE and required:
 * - PENDING, QUEUED, DELIVERED, RUNNING: normal lifecycle
 * - COMPLETED, FAILED: terminal success/failure
 * - TIMEOUT: running job exceeded timeoutSeconds
 * - CANCELLED: admin/system cancellation from any non-terminal state
 * - EXPIRED: TTL exceeded (4h default per ADR-042)
 * 
 * The `fail()` method implements auto-retry: if retryCount < maxRetries,
 * status returns to PENDING for re-queuing instead of going to FAILED.
 */

/*
stateDiagram-v2
    [*] --> PENDING : Job.create()
    PENDING --> QUEUED : queue()
    QUEUED --> DELIVERED : deliver()
    DELIVERED --> RUNNING : start()
    RUNNING --> COMPLETED : complete(result)
    RUNNING --> FAILED : fail() [retries exhausted]
    RUNNING --> PENDING : fail() [retry available]
    RUNNING --> TIMEOUT : timeout()
    
    PENDING --> CANCELLED : cancel()
    QUEUED --> CANCELLED : cancel()
    DELIVERED --> CANCELLED : cancel()
    RUNNING --> CANCELLED : cancel()
    
    PENDING --> EXPIRED : expire()
    QUEUED --> EXPIRED : expire()
    DELIVERED --> EXPIRED : expire()
    RUNNING --> EXPIRED : expire()

    COMPLETED --> [*]
    FAILED --> [*]
    TIMEOUT --> [*]
    CANCELLED --> [*]
    EXPIRED --> [*]

    note right of PENDING
        Auto-retry returns here
        from RUNNING via fail()
    end note

    note right of EXPIRED
        TTL = 4h (ADR-042)
        Cleanup buffer = 2h
    end note
*/
