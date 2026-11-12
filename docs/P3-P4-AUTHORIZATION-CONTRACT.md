# P3â€“P4 authorization adapter contract (Step 3)

Source: `backend/src/modules/platform/integration/authorization.ts`.

**Mount P4 routers behind `optionalAuth` middleware**, which populates `req.auth` from the existing server-side demo session. Never use request bodies, arbitrary headers, or user-provided IDs as identities.

Completion: import `completionAuthorization` and pass it as the second argument to P4 `createCompletionRouter(service, completionAuthorization)`. This adapter matches P4's `CompletionAuthorization` interface structurally. Organiser and submitter are limited to the project organiser or admin. Reviewers are reviewer/admin. Viewers are organiser of that project, reviewer, or admin. Sponsor and resident do not gain protected milestone access by default. P4's `canSubmitProof` argument is a **milestone ID** (despite its name `resourceId`).

Evidence: import `createEvidenceAuthorization` and pass its result as the sixth argument to `createEvidenceRouter(service, resolveReviewerIdentity, resolveOrganiserIdentity, resolveUploaderIdentity, authorization)`. The resource lookup interface needs P4's DB repository to implement `evidenceProjectId`, `reviewProjectId`, and `expenseProjectId`. Missing lookups deny access. `canUpload` without expenseId checks project ownership only; P4 must additionally verify the uploaded milestone belongs to the project. Preauthorize BEFORE Multer writes files; P4 must change the upload route to do so.

**Gate A remains disabled**: P4's current route requires BOTH `resolveReviewerIdentity(req)` and `resolveOrganiserIdentity(req)` for one request, which conflicts with separation of duties. P4/P2 must define distinct reviewer and organiser approval events, with trusted stored identities, before this route can be enabled.

This is a development integration adapter, not a production authorization certification. The demo switch-role endpoint must not be enabled in production without strong protection. The adapter currently trusts an authenticated reviewer for any existing project, because no reviewer assignment table exists; refine when project-level reviewer assignment is defined. P4 must supply resource ownership lookups and persist its repositories before integration is complete.

Database errors propagate to the route error boundary and MUST NOT result in access being granted. P4 should use the existing `{error:{code,message}}` API error contract rather than returning sensitive exception messages.
