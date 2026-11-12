P4 Integration Blockers
Status: In progress
Working branch: feature/p4-evidence-completion
Last updated: 2026-11-12

This document tracks the P4 integration work against the existing P3 platform. Items marked Implemented — integration confirmation pending are present in the feature branch but still require confirmation against the integrated application/database before being treated as complete.
P0 — Required before merge
1. PostgreSQL repositories
Status: Implemented — integration confirmation pending
- Evidence and completion repositories use the shared P3 PostgreSQL pool from backend/src/config/database.ts.
- The integrated application is configured to use PostgreSQL repositories rather than in-memory repositories.
- In-memory repositories remain available for isolated tests/demo use only.
- Confirm the repository SQL against the actual P3 schema and migration conventions before deployment.
2. Atomic attestation batch creation
Status: Implemented — integration confirmation pending
- Attestations for a milestone are created through one repository batch operation.
- The PostgreSQL implementation wraps the batch in a transaction and revalidates milestone/spec/household project ownership inside that transaction.
- The database migration defines a unique constraint on (spec_id, household_id).
- A failed batch must roll back completely; no partial attestation set may remain.
- Confirm the unique constraint and transaction behavior against the deployed database schema.
3. Gate A identity workflow
Status: Implemented — integration confirmation pending
- Reviewer identity is resolved from the authenticated reviewer session.
- Organiser identity is loaded independently from the trusted project record; it is not resolved from the same request session as the reviewer.
- Gate A authorization checks reviewer permission and verifies project/expense/evidence ownership.
- The route validates that the evidence belongs to the requested project and milestone.
4. Integrated authorization tests using P3 sessions
Status: Partially implemented — remaining cases required
- Tests exercise the P3 optionalAuth session middleware and reviewer-role authorization.
- Existing authorization tests cover cross-project denial and invalid resource identifiers through authorization-level tests.
- Remaining work: ensure the integrated P3-session route tests explicitly cover cross-project access, invalid IDs, and missing permissions for the P4 routes. Do not mark this item complete until those cases are covered.
P1 — External integration and hardening
5. Gate B trusted Tranche A prerequisite provider
Status: Blocked on P2
- Coordinate with P2 to consume the trusted Tranche A prerequisite/status provider.
- Do not use client-supplied or locally fabricated prerequisite status as the production source of truth.
- Keep Gate B blocked/deny-by-default until the trusted provider is connected.
6. Real invoice extraction provider
Status: Blocked on P1/provider integration
- Connect the real invoice/document extraction provider.
- Mock extraction must remain disabled outside an explicit demo/test mode.
- Production behavior must fail safely when the real provider is not configured; it must not silently return mock extraction results.
7. Reconcile with P3 workspace and package structure
Status: Pending integration confirmation
- Preserve the existing P3 application, package configuration, dependencies, and workspace structure.
- Do not replace or duplicate P3 infrastructure.
- Confirm P4 migrations and scripts follow the repository's established migration mechanism before applying them.
8. Pre-upload authorization
Status: Implemented — client integration required
- Upload routes run authentication and authorization.canUpload() before Multer parses/processes the multipart file.
- The pre-upload check reads x-project-id and x-expense-id headers as resource identifiers and authorizes them against the authenticated uploader.
- After multipart parsing, the handler compares those headers with the projectId and expenseId form fields and rejects mismatches.
- The handler retains its authorization check before writing the file to disk.
- The frontend/client must send both headers and ensure they match the multipart form fields. These headers are identifiers only; they are not proof of identity or permission.
Database migration notes
- P4 migration currently resides at db/migrations/001_p4_evidence_completion.sql.
- The repository's established P3 migration runner/conventions and the actual deployed P3 table definitions must be confirmed before this migration is applied.
- Check all required foreign keys, indexes, uniqueness constraints, and compatibility with existing P3 tables. Do not assume a standalone SQL file is automatically executed.
- Do not apply the migration to a shared or production database until the schema review is complete.
Merge / release gate
Do not merge this feature branch into main yet. Keep working on feature/p4-evidence-completion until:
1. PostgreSQL repository SQL and migration compatibility are confirmed against P3.
2. Attestation batch atomicity and uniqueness are confirmed against PostgreSQL.
3. P3-session integration tests cover cross-project access, invalid IDs, and missing permissions.
4. P2's trusted Tranche A provider and P1's real extraction provider are integrated or explicitly documented as external blockers for the intended release scope.
5. Backend typecheck, build, and relevant test suite pass after the final integration changes.
When the PostgreSQL repositories and transactional attestation operation are ready and pushed, notify the reviewer as requested. Do not merge without reviewer approval.