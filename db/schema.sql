PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employees (
  open_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  email TEXT,
  manager_open_id TEXT,
  role_level TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visibility_policies (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  content_type TEXT NOT NULL,
  default_visibility TEXT NOT NULL,
  redaction_level TEXT NOT NULL,
  rule_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT,
  source_sha256 TEXT,
  imported_by_open_id TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'imported',
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  employee_open_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  department TEXT,
  week_label TEXT NOT NULL,
  week_start TEXT,
  week_end TEXT,
  status TEXT,
  content_json TEXT NOT NULL,
  source_batch_id TEXT,
  source_hash TEXT,
  is_late INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(employee_open_id, week_label),
  FOREIGN KEY(source_batch_id) REFERENCES import_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_employee ON weekly_reports(employee_open_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(week_start, week_end);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  source_batch_id TEXT,
  release_id TEXT,
  input_hash TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  summary_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(source_batch_id) REFERENCES import_batches(id)
);

CREATE TABLE IF NOT EXISTS analysis_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  priority TEXT,
  title TEXT NOT NULL,
  employee_open_id TEXT,
  department TEXT,
  visibility TEXT NOT NULL DEFAULT 'management',
  redaction_level TEXT NOT NULL DEFAULT 'summary',
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analysis_items_run_type ON analysis_items(run_id, item_type);
CREATE INDEX IF NOT EXISTS idx_analysis_items_visibility ON analysis_items(visibility);

CREATE TABLE IF NOT EXISTS task_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  employee_open_id TEXT,
  employee_name TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date TEXT,
  metric TEXT,
  evidence TEXT,
  ai_intent TEXT,
  first_step TEXT,
  support_needed TEXT,
  context_need TEXT,
  selected INTEGER NOT NULL DEFAULT 0,
  created_task_guid TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_candidates_employee ON task_candidates(employee_open_id, employee_name);
CREATE INDEX IF NOT EXISTS idx_task_candidates_status ON task_candidates(status);

CREATE TABLE IF NOT EXISTS feishu_tasks (
  guid TEXT PRIMARY KEY,
  candidate_id TEXT,
  idempotency_key TEXT UNIQUE,
  summary TEXT NOT NULL,
  assignee_open_id TEXT,
  due_date TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(candidate_id) REFERENCES task_candidates(id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  author_open_id TEXT NOT NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'department',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);

CREATE TABLE IF NOT EXISTS ai_followup_messages (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  role TEXT NOT NULL,
  author_open_id TEXT,
  author_name TEXT,
  body TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_followup_messages_candidate ON ai_followup_messages(candidate_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor_open_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'like',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_type, target_id, actor_open_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_open_id TEXT,
  recipient_name TEXT,
  actor_open_id TEXT,
  actor_name TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_employee_name TEXT,
  title TEXT NOT NULL,
  body TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_open_id, recipient_name, read_at, created_at);

CREATE TABLE IF NOT EXISTS public_highlights (
  id TEXT PRIMARY KEY,
  weekly_report_id TEXT NOT NULL,
  employee_open_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT,
  approved_by_open_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(weekly_report_id) REFERENCES weekly_reports(id)
);

CREATE TABLE IF NOT EXISTS external_share_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  scope TEXT NOT NULL DEFAULT 'boss_view',
  created_by_open_id TEXT,
  created_by_name TEXT,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_external_share_links_status ON external_share_links(status, expires_at);

CREATE TABLE IF NOT EXISTS contribution_events (
  id TEXT PRIMARY KEY,
  actor_open_id TEXT NOT NULL,
  actor_name TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contribution_actor ON contribution_events(actor_open_id, created_at);

CREATE TABLE IF NOT EXISTS company_message_sends (
  id TEXT PRIMARY KEY,
  period_id TEXT,
  period_label TEXT,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  original_draft TEXT NOT NULL,
  final_message TEXT NOT NULL,
  sent_by_open_id TEXT,
  sent_by_name TEXT,
  feishu_message_id TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_company_message_sends_period ON company_message_sends(period_id, created_at);

CREATE TABLE IF NOT EXISTS weekly_reminder_sends (
  id TEXT PRIMARY KEY,
  period_id TEXT,
  period_label TEXT,
  recipient_open_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  department TEXT,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  identity TEXT NOT NULL DEFAULT 'bot',
  feishu_message_id TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weekly_reminder_sends_period ON weekly_reminder_sends(period_id, created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_reminder_sends_recipient ON weekly_reminder_sends(recipient_open_id, created_at);

CREATE TABLE IF NOT EXISTS weekly_reminder_outbox (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  period_label TEXT,
  recipient_open_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  department TEXT,
  message TEXT NOT NULL,
  personalization_note TEXT,
  provider TEXT NOT NULL DEFAULT 'kimi',
  model TEXT,
  prompt_hash TEXT,
  status TEXT NOT NULL DEFAULT 'prepared',
  source_json TEXT NOT NULL DEFAULT '{}',
  feishu_message_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(period_id, recipient_open_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reminder_outbox_period ON weekly_reminder_outbox(period_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_reminder_outbox_recipient ON weekly_reminder_outbox(recipient_open_id, updated_at);

CREATE TABLE IF NOT EXISTS scoring360_cycles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'monthly',
  start_date TEXT,
  end_date TEXT,
  launch_at TEXT,
  due_at TEXT,
  followup_after_at TEXT,
  historical_weight REAL NOT NULL DEFAULT 0.3,
  current_weight REAL NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'draft',
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_evaluees INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scoring360_assignments (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  evaluee_name TEXT NOT NULL,
  evaluator_name TEXT NOT NULL,
  evaluee_open_id TEXT,
  evaluator_open_id TEXT,
  relationship TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cycle_id, evaluee_name, evaluator_name),
  FOREIGN KEY(cycle_id) REFERENCES scoring360_cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scoring360_assignments_evaluator ON scoring360_assignments(cycle_id, evaluator_name);
CREATE INDEX IF NOT EXISTS idx_scoring360_assignments_evaluee ON scoring360_assignments(cycle_id, evaluee_name);

CREATE TABLE IF NOT EXISTS scoring360_responses (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  evaluee_name TEXT NOT NULL,
  evaluator_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  dimension_scores_json TEXT NOT NULL DEFAULT '{}',
  comment TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(assignment_id),
  CHECK(score >= 0 AND score <= 100),
  FOREIGN KEY(assignment_id) REFERENCES scoring360_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY(cycle_id) REFERENCES scoring360_cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scoring360_responses_cycle_evaluee ON scoring360_responses(cycle_id, evaluee_name);
CREATE INDEX IF NOT EXISTS idx_scoring360_responses_cycle_evaluator ON scoring360_responses(cycle_id, evaluator_name);

CREATE TABLE IF NOT EXISTS scoring360_reminder_sends (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  cycle_label TEXT,
  evaluator_open_id TEXT,
  evaluator_name TEXT NOT NULL,
  pending_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'launch',
  source TEXT NOT NULL DEFAULT 'manual',
  identity TEXT NOT NULL DEFAULT 'bot',
  feishu_message_id TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'dry_run',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(cycle_id) REFERENCES scoring360_cycles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scoring360_reminder_sends_cycle ON scoring360_reminder_sends(cycle_id, kind, status, created_at);

CREATE TABLE IF NOT EXISTS lark_auth_monitor_sends (
  id TEXT PRIMARY KEY,
  app_id TEXT,
  user_open_id TEXT,
  user_name TEXT,
  threshold_hours INTEGER NOT NULL,
  refresh_expires_at TEXT NOT NULL,
  message TEXT NOT NULL,
  identity TEXT NOT NULL DEFAULT 'bot',
  feishu_message_id TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(app_id, user_open_id, threshold_hours, refresh_expires_at)
);

CREATE INDEX IF NOT EXISTS idx_lark_auth_monitor_sends_user ON lark_auth_monitor_sends(user_open_id, refresh_expires_at, threshold_hours);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('2026-05-16-001-initial-weekly-report-os');
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('2026-06-04-001-scoring360');
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('2026-06-12-001-scoring360-reminders');
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('2026-06-29-001-lark-auth-monitor');
