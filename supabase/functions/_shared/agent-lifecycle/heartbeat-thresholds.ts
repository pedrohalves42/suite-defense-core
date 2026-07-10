/**
 * Canonical heartbeat thresholds (P0-02).
 *
 * Single source of truth for heartbeat / offline / alert windows. The SQL
 * side mirrors these values in migration `20260710_heartbeat_alignment.sql`
 * — keep both in sync.
 *
 * Rationale (see docs/audits/active/evidence/P0-02-heartbeat/discovery.md):
 * the previous implementation detected offline at 10min but only alerted
 * at 48h, violating the backlog requirement `alert <= 3 * heartbeat`.
 */

export const HEARTBEAT_INTERVAL_SECONDS = 60;

/**
 * An agent is marked `offline` once it has missed 3 consecutive heartbeats.
 * Formerly hardcoded as 10 minutes in `auto_mark_agents_inactive()`.
 */
export const OFFLINE_THRESHOLD_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3; // 180s

/**
 * Threshold for the FIRST alert on an offline agent — same 3x interval.
 * Emitted by `alert_short_offline_agents()` (severity: medium).
 */
export const ALERT_SHORT_THRESHOLD_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3; // 180s

/**
 * Threshold for the ESCALATION alert on prolonged offline agents.
 * Emitted by `alert_long_offline_agents()` (severity: high). 48h retained
 * intentionally as the long-lived signal for on-call escalation.
 */
export const ALERT_LONG_THRESHOLD_HOURS = 48;
export const ALERT_LONG_THRESHOLD_SECONDS = ALERT_LONG_THRESHOLD_HOURS * 3600;

/** Machine-readable manifest used by tests and observability. */
export const HEARTBEAT_THRESHOLDS = Object.freeze({
  heartbeat_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
  offline_threshold_seconds: OFFLINE_THRESHOLD_SECONDS,
  alert_short_threshold_seconds: ALERT_SHORT_THRESHOLD_SECONDS,
  alert_long_threshold_hours: ALERT_LONG_THRESHOLD_HOURS,
  alert_long_threshold_seconds: ALERT_LONG_THRESHOLD_SECONDS,
});
