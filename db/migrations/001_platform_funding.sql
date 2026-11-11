-- P3-owned core schema. P1/P2/P4 add their own migrations later.
-- All monetary values are integer USD cents (BIGINT); never floating-point.
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
 email text NOT NULL UNIQUE,
 role text NOT NULL CHECK (role IN ('organiser','reviewer','sponsor','resident','admin')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE communities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES communities(id),
 organiser_id uuid NOT NULL REFERENCES users(id), title text NOT NULL,
 description text NOT NULL DEFAULT '', goal_minor bigint NOT NULL CHECK (goal_minor > 0),
 currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planning','funding','delivering','complete')),
 target_date date,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 category text NOT NULL, description text NOT NULL DEFAULT '',
 approved_minor bigint NOT NULL CHECK (approved_minor >= 0),
 version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
 approved_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 title text NOT NULL, due_date date,
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','delivered','gate_a_approved','proof_submitted','gate_b_approved','complete')),
 budget_id uuid REFERENCES budgets(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE funding_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 households integer NOT NULL CHECK (households > 0),
 assumptions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 scenarios_json jsonb NOT NULL DEFAULT '[]'::jsonb,
 verdict text NOT NULL CHECK (verdict IN ('resident_fundable','needs_partners','needs_rescope')),
 accepted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE funding_plan_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES funding_plans(id),
 source_type text NOT NULL CHECK (source_type IN ('resident','sponsor_cash','in_kind','pool')),
 amount_minor bigint NOT NULL CHECK (amount_minor >= 0), rationale text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE budget_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), budget_id uuid NOT NULL REFERENCES budgets(id),
 label text NOT NULL, amount_minor bigint NOT NULL CHECK (amount_minor > 0),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','funded','released')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE funders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 type text NOT NULL CHECK (type IN ('sponsor','resident','organisation')),
 name text NOT NULL, contact_ref text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE funder_commitments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funder_id uuid NOT NULL REFERENCES funders(id),
 slot_id uuid REFERENCES budget_slots(id),
 kind text NOT NULL CHECK (kind IN ('cash','in_kind')),
 amount_minor bigint NOT NULL CHECK (amount_minor > 0), order_id text,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE households (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 invite_hash text NOT NULL UNIQUE, participating boolean NOT NULL DEFAULT false,
 covered_by_pool boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id),
 entity text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL,
 metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- Audit history is append-only, including for the application's DB role.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END;
$$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
-- Automatically maintain updated_at on mutable P3 entities.
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','communities','projects','budgets','milestones',
 'funding_plans','funding_plan_lines','budget_slots','funders','funder_commitments','households'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', 'touch_' || t, t);
 END LOOP;
END $$;
CREATE INDEX idx_projects_community ON projects(community_id);
CREATE INDEX idx_projects_organiser ON projects(organiser_id);
CREATE INDEX idx_budgets_project ON budgets(project_id);
CREATE INDEX idx_milestones_project ON milestones(project_id);
CREATE INDEX idx_funding_plans_project ON funding_plans(project_id);
CREATE INDEX idx_funding_plan_lines_plan ON funding_plan_lines(plan_id);
CREATE INDEX idx_budget_slots_budget ON budget_slots(budget_id);
CREATE INDEX idx_funder_commitments_funder ON funder_commitments(funder_id);
CREATE INDEX idx_funder_commitments_slot ON funder_commitments(slot_id);
CREATE INDEX idx_households_project ON households(project_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_events_actor ON audit_events(actor_id, created_at DESC);