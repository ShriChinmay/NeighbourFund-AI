
# P4 Integration Blockers

## 1. Household-to-Project Ownership Validation

**Status:** Pending P3 integration.

### Current implementation
- Completion specifications are associated with milestone IDs.
- Attestation generation validates empty and duplicate household IDs.
- Duplicate invitations for the same completion specification are rejected.
- Attestation tokens are securely hashed before persistence.
- Household ownership against the milestone's project is not yet verified.

### Required P3 dependency
P3 must provide a trusted project/household ownership interface that allows P4 to verify:

- The milestone belongs to the expected project.
- Each household ID belongs to that project.
- Cross-project household associations are rejected.
- Missing or unavailable ownership data results in denial.

### P4 integration requirement
Before creating attestation records, P4 must validate every requested household against the project associated with the completion specification's milestone.

All household IDs must be validated before any attestation is created.

### Acceptance criteria
- Valid households belonging to the milestone's project can receive attestations.
- Households belonging to another project are rejected.
- Unknown household IDs are rejected.
- Mixed valid and invalid household requests create no partial attestations.
- Ownership-provider failures do not bypass validation.

### Ownership
- P3: Project, milestone ownership and household data infrastructure.
- P4: Completion workflow and attestation validation integration.

## 2. PostgreSQL Persistence

**Status:** Pending P3 database foundation.

P4 currently uses repository interfaces and in-memory implementations.

P3 must provide the agreed PostgreSQL connection, schema and migration conventions before production persistence integration.

## 3. Gate B Payment Prerequisites

**Status:** Pending P2 integration.

P4 exposes a typed prerequisite provider for Tranche A payment/submission status.

P2 must supply the trusted payment-status implementation. Gate B must remain ineligible when this provider is unavailable.

## 4. Authentication and Authorization

**Status:** Pending P3 authentication integration.

P4 exposes injectable authorization interfaces and deny-by-default implementations.

P3 must supply trusted identity resolution and project/milestone permission checks. P4 must not introduce a separate authentication or RBAC system.

## 5. Integration Boundary

P4 must not duplicate:
- P1 AI extraction and completion analysis.
- P2 payment and tranche-release decisions.
- P3 authentication, project ownership, database infrastructure and shared contracts.
