-- P2 Batch 1: USD-only sandbox money core. No external money movement in this migration.
-- All minor units are positive integer cents. External provider IDs are nullable until verified.
CREATE TABLE payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  payer_user_id uuid NOT NULL REFERENCES users(id),
  slot_id uuid REFERENCES budget_slots(id),
  kind text NOT NULL CHECK (kind IN ('resident','sponsor')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency='USD'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','captured','failed','cancelled','refunded','partially_refunded')),
  provider text NOT NULL DEFAULT 'paypal' CHECK (provider='paypal'),
  provider_order_id text UNIQUE,
  provider_capture_id text UNIQUE,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payer_user_id,idempotency_key)
);
CREATE INDEX idx_payment_intents_project ON payment_intents(project_id,created_at DESC);
CREATE INDEX idx_payment_intents_payer ON payment_intents(payer_user_id,created_at DESC);
CREATE TRIGGER touch_payment_intents BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Provider events are recorded once; processing status is not proof of payment.
CREATE TABLE payment_provider_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK(provider='paypal'),
 provider_event_id text NOT NULL,
 event_type text NOT NULL,
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 verification_status text NOT NULL CHECK(verification_status IN ('verified','rejected')),
 processing_status text NOT NULL DEFAULT 'received' CHECK(processing_status IN ('received','processed','failed')),
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(provider,provider_event_id)
);

-- Chart of accounts: per-project segregated accounts, never floating point.
CREATE TABLE ledger_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES projects(id),
 code text NOT NULL CHECK(code IN ('paypal_clearing','project_funds','refunds','disbursements')),
 currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,code),
 UNIQUE(id,project_id)
);
CREATE TABLE ledger_journals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES projects(id),
 source_type text NOT NULL CHECK(source_type IN ('paypal_capture','paypal_refund','payout','adjustment')),
 source_id text NOT NULL,
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_type,source_id),
 UNIQUE(id,project_id)
);
CREATE TABLE ledger_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 journal_id uuid NOT NULL,
 project_id uuid NOT NULL,
 account_id uuid NOT NULL,
 side text NOT NULL CHECK(side IN ('debit','credit')),
 amount_minor bigint NOT NULL CHECK(amount_minor > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(journal_id,project_id) REFERENCES ledger_journals(id,project_id),
 FOREIGN KEY(account_id,project_id) REFERENCES ledger_accounts(id,project_id)
);
CREATE INDEX idx_ledger_entries_journal ON ledger_entries(journal_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries(account_id,created_at DESC);

-- Protect committed journals from edits and deletion, including direct SQL via app DB role.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'posted ledger is append-only'; END;
$$;
CREATE TRIGGER ledger_journals_no_mutation BEFORE UPDATE OR DELETE ON ledger_journals
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER ledger_entries_no_mutation BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

-- Enforce balanced entries at transaction COMMIT, not just in application code.
CREATE FUNCTION check_ledger_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_total numeric; credit_total numeric; entry_count bigint;
BEGIN
 SELECT COALESCE(SUM(amount_minor) FILTER(WHERE side='debit'),0),
        COALESCE(SUM(amount_minor) FILTER(WHERE side='credit'),0),COUNT(*)
 INTO debit_total,credit_total,entry_count FROM ledger_entries WHERE journal_id=NEW.id;
 IF entry_count < 2 OR debit_total <> credit_total THEN
   RAISE EXCEPTION 'unbalanced ledger journal %',NEW.id;
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced
AFTER INSERT ON ledger_journals DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_ledger_balance();

-- Keep journal entries immutable once inserted; all corrections are reversing journals.
-- Prevent post-commit entry insertion into existing journals by requiring the journal
-- to have been created in the same transaction (xmin transaction ID).
CREATE FUNCTION check_ledger_entry_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_xmin xid;
BEGIN
 SELECT xmin INTO journal_xmin FROM ledger_journals WHERE id=NEW.journal_id;
 IF journal_xmin IS NULL OR journal_xmin <> pg_current_xact_id()::text::xid THEN
   RAISE EXCEPTION 'cannot add entries to an existing ledger journal';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_entries_insert_guard BEFORE INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION check_ledger_entry_insert();
