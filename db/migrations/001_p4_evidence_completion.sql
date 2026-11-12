
BEGIN;

-- Evidence documents
CREATE TABLE IF NOT EXISTS p4_evidence (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    milestone_id UUID,
    expense_id UUID,
    uploaded_by TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (
        mime_type IN (
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp'
        )
    ),
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    status TEXT NOT NULL DEFAULT 'uploaded',
    extracted_metadata JSONB,
    confirmed_metadata JSONB,
    confidence JSONB,
    extraction_provider TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p4_evidence_project
ON p4_evidence(project_id);

CREATE INDEX IF NOT EXISTS idx_p4_evidence_expense
ON p4_evidence(expense_id);

-- P4 expense records
CREATE TABLE IF NOT EXISTS p4_expenses (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    budget_id UUID NOT NULL,
    vendor TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    currency TEXT,
    expense_date DATE NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p4_expenses_project
ON p4_expenses(project_id);

-- Evidence discrepancy flags
CREATE TABLE IF NOT EXISTS p4_evidence_flags (
    id UUID PRIMARY KEY,
    expense_id UUID NOT NULL REFERENCES p4_expenses(id),
    evidence_id UUID REFERENCES p4_evidence(id),
    flag_type TEXT NOT NULL,
    explanation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at TIMESTAMPTZ,
    superseded_reason TEXT
);

-- Verification reviews
CREATE TABLE IF NOT EXISTS p4_verification_reviews (
    id UUID PRIMARY KEY,
    expense_id UUID NOT NULL REFERENCES p4_expenses(id),
    evidence_id UUID REFERENCES p4_evidence(id),
    flag_type TEXT NOT NULL,
    explanation TEXT NOT NULL,
    reviewer_id TEXT,
    resolution TEXT,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at TIMESTAMPTZ,
    superseded_reason TEXT
);

-- Append-only review audit history
CREATE TABLE IF NOT EXISTS p4_review_audit_events (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL REFERENCES p4_verification_reviews(id),
    expense_id UUID NOT NULL REFERENCES p4_expenses(id),
    evidence_id UUID REFERENCES p4_evidence(id),
    reviewer_id TEXT,
    previous_resolution TEXT,
    new_resolution TEXT,
    previous_reason TEXT,
    new_reason TEXT,
    action TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Completion specifications
CREATE TABLE IF NOT EXISTS p4_completion_specs (
    id UUID PRIMARY KEY,
    milestone_id UUID NOT NULL UNIQUE,
    spec JSONB NOT NULL,
    min_attestations INTEGER NOT NULL CHECK (min_attestations > 0),
    window_days INTEGER NOT NULL CHECK (window_days > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Proof submissions
CREATE TABLE IF NOT EXISTS p4_proof_submissions (
    id UUID PRIMARY KEY,
    spec_id UUID NOT NULL REFERENCES p4_completion_specs(id),
    file_refs JSONB NOT NULL,
    checklist JSONB NOT NULL,
    ai_summary JSONB,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p4_proofs_spec
ON p4_proof_submissions(spec_id, submitted_at DESC);

-- Proof reviews
CREATE TABLE IF NOT EXISTS p4_proof_reviews (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES p4_proof_submissions(id),
    reviewer_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_p4_proof_reviews_submission
ON p4_proof_reviews(submission_id, created_at DESC);

-- Household attestations
CREATE TABLE IF NOT EXISTS p4_attestations (
    id UUID PRIMARY KEY,
    spec_id UUID NOT NULL REFERENCES p4_completion_specs(id),
    household_id UUID NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    response TEXT CHECK (
        response IS NULL OR response IN ('works', 'not_working')
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_p4_attestation_spec_household
        UNIQUE (spec_id, household_id)
);

CREATE INDEX IF NOT EXISTS idx_p4_attestations_spec
ON p4_attestations(spec_id);

COMMIT;
