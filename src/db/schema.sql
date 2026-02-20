CREATE TABLE IF NOT EXISTS providers (
  type TEXT PRIMARY KEY,
  api_key TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default providers with empty keys
INSERT OR IGNORE INTO providers (type, base_url) VALUES
  ('openai', 'https://api.openai.com'),
  ('anthropic', 'https://api.anthropic.com'),
  ('gemini', 'https://generativelanguage.googleapis.com'),
  ('codex', 'https://api.openai.com');
