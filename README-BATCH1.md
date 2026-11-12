# NeighbourFund-AI — P2 Batch 1: Money core (development)

**Base:** current `main` after PR #3. Extract at repository root on `feature/p2-money-core`.

## What is implemented
- `003_p2_money_core.sql`: USD-only payment intents, deduplicated provider-event inbox, project-segregated ledger accounts, append-only journals/entries, deferred SQL balance check, indices.
- Validated, idempotent **unpaid** payment intent creation for authenticated resident/sponsor roles.
- Read-only own-intent listing.
- Internal double-entry journal writer; no external API for arbitrary ledger credits.
- Unit tests for validation and balance invariants.

## Not implemented yet
- No PayPal orders, capture, verified webhook ingestion, refund handling, reconciliation or payout execution. These are Batches 2–4.
- No payment is marked `captured` in this package; `checkoutAvailable:false` is deliberate.
- No P4 Gate B integration. Never use an intent as proof of paid money.
- Database migration and HTTP integration tests require your local Postgres and should be run before merge.

## Installation (PowerShell, repository root)
```powershell
git status --short
git switch main
git pull --ff-only origin main
git switch -c feature/p2-money-core
# Extract ZIP into this root, preserving folders.
powershell -ExecutionPolicy Bypass -File .\APPLY-BATCH1.ps1
npm run typecheck:api
npm run test:api
npm run db:migrate
npm run db:check
git diff --check
git status --short
```
**Run `db:migrate` only against the local development DB**, not production. Do not run if the current database has been modified outside versioned migrations.

## Routes
- `POST /api/payment-intents` (resident/sponsor authenticated). Body: `{projectId,kind,amountMinor,slotId?,idempotencyKey}`. Response 201 `{intent,checkoutAvailable:false}`.
- `GET /api/projects/:id/payment-intents/mine` (resident/sponsor authenticated). Response `{intents:[...]}`.

## Integration notes
- Payment intents are deliberately separate from existing `funder_commitments`: commitments and funding-slot statuses must not be updated until provider capture is verified.
- `postJournal` is internal-only; later batches must verify PayPal event authenticity, match provider capture amount/currency/order, and transact status update + journal posting atomically.
- The application database role should be restricted in production. The trigger protects ordinary application writes, not privileged database superusers.
- Provider-event `verification_status` must only be written by trusted webhook verification code in Batch 2.
- `payment_intents` are payer-owned; this batch does not expose public payment records.
- Existing platform uses USD cents; don't change to INR without a separately reviewed multi-currency migration.

## Acceptance before merging
- Migration succeeds on fresh and existing local databases.
- 28+ existing backend tests and 8 new tests pass, frontend remains unaffected.
- Verify a duplicate idempotency key with same request returns same intent, different request returns 409, and non-funding project returns 409 in local integration testing.
- Verify SQL rejects unbalanced journals and post-commit journal edits.
