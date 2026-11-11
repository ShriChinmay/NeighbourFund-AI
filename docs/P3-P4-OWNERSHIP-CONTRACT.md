# P3 ownership contract for P4

Implementation: `backend/src/modules/platform/ownership/ownership.ts`.

Functions:
- `getMilestoneProjectId(milestoneId): Promise<string | null>`
- `getHouseholdProjectId(householdId): Promise<string | null>`
- `milestoneBelongsToProject(milestoneId, projectId): Promise<boolean>`
- `householdBelongsToProject(householdId, projectId): Promise<boolean>`
- `validateAttestationHouseholds(milestoneId, householdIds): Promise<boolean>`

All IDs are UUIDs. Missing or invalid IDs return null/false. Database errors throw and MUST deny the operation. The batch validator checks all supplied household IDs belong to the milestone's project and rejects duplicates.

**Important:** The batch validator is a preflight check, NOT a transactional guarantee. P4 must recheck ownership using the same PostgreSQL transaction/connection that creates the attestation records, or enforce equivalent referential integrity/locking. P4 must also use unique constraints and atomic single-use token redemption. No tokens should be returned for a failed batch.

P3's current households are project-linked invitation records; `participating` does not by itself establish an authenticated resident identity. P4 must not assume household possession or identity from the UUID alone.
