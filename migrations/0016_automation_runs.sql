-- Automation traces: each time a rule's trigger matched (or a person ran it), which trigger it was,
-- how every condition came out and how the actions went. The last 50 per automation are kept.
CREATE TABLE automation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    started_at DATETIME NOT NULL,
    finished_at DATETIME,
    -- JSON: {"index": n} for the rule's nth trigger, {"manual": actor} when a person ran it
    trigger TEXT NOT NULL,
    -- JSON: [{"index": n, "passed": bool}]
    conditions TEXT NOT NULL DEFAULT '[]',
    -- running | done | failed | blocked (a condition was not met)
    outcome TEXT NOT NULL,
    -- JSON: ["error", ...]
    errors TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_automation_runs_automation ON automation_runs(automation_id, id);
