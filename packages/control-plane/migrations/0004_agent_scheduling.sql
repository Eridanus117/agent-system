ALTER TABLE activation_operation RENAME COLUMN client_id TO agent_id;
ALTER TABLE launch_observation RENAME COLUMN client_id TO agent_id;

DROP INDEX IF EXISTS idx_activation_operation_client_updated;
CREATE INDEX IF NOT EXISTS idx_activation_operation_agent_updated
  ON activation_operation(agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_schedule (
  schedule_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  revision_id TEXT NOT NULL REFERENCES configuration_revision(revision_id),
  trigger_json TEXT NOT NULL,
  target_json TEXT NOT NULL,
  session_policy TEXT NOT NULL CHECK (session_policy IN ('fresh', 'reuse')),
  precheck_ref TEXT,
  source_context_ref TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS dispatch_operation (
  operation_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES agent_schedule(schedule_id),
  agent_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  target_json TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('planned', 'dispatched', 'observing', 'succeeded', 'degraded', 'failed', 'skipped', 'unknown')),
  automation_id TEXT,
  manifest_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  terminal_reason TEXT,
  version INTEGER NOT NULL,
  receipt_automation_id TEXT,
  receipt_provider TEXT,
  receipt_target_json TEXT,
  receipt_trigger_json TEXT,
  receipt_created_at TEXT,
  receipt_source_evidence TEXT,
  UNIQUE (operation_id, receipt_automation_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_dispatch_operation_schedule_updated
  ON dispatch_operation(schedule_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_operation_agent_updated
  ON dispatch_operation(agent_id, updated_at DESC);
