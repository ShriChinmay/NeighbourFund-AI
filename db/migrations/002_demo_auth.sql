-- Five synthetic users for the sandbox-only role switcher.
-- Stable IDs make repeatable local tests and demo setup possible.
INSERT INTO users (id, display_name, email, role)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'Demo Organiser', 'organiser@demo.neighbourfund.invalid', 'organiser'),
  ('00000000-0000-4000-8000-000000000102', 'Demo Reviewer',  'reviewer@demo.neighbourfund.invalid',  'reviewer'),
  ('00000000-0000-4000-8000-000000000103', 'Demo Sponsor',   'sponsor@demo.neighbourfund.invalid',   'sponsor'),
  ('00000000-0000-4000-8000-000000000104', 'Demo Resident',  'resident@demo.neighbourfund.invalid',  'resident'),
  ('00000000-0000-4000-8000-000000000105', 'Demo Admin',     'admin@demo.neighbourfund.invalid',     'admin')
ON CONFLICT (id) DO NOTHING;

-- Server-side sessions can be revoked and expire even if a cookie survives.
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TRIGGER touch_auth_sessions BEFORE UPDATE ON auth_sessions
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
