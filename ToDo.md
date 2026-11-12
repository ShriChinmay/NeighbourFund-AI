# NeighbourFund-AI — Frontend TODO & Handoff

> **Branch:** `feature/web-foundation`  
> **Status:** Paused after Phase 1 of 5 (foundation)  
> **Owner:** P3 — frontend implementation (all 13 planned page/workflow areas)  
> **Last handoff:** 2026-11-11  
> **Important:** This is a frontend roadmap and resumption guide, not a claim that the 13 pages are implemented.

## 1. Current checkpoint

### Completed — Phase 1: Foundation

- [x] React + TypeScript + Vite foundation with npm workspaces.
- [x] Installed frontend dependencies: React Router, TanStack Query, Zod, React Hook Form, Tailwind CSS, AG Grid, MSW, Vitest, React Testing Library, ESLint, and Prettier.
- [x] Created feature-first directories under `frontend/src/{app,features,components,services,lib,styles,test,pages}`.
- [x] Added lazy-loaded router with the **legacy dashboard as fallback**; do not remove it before replacing its working flows.
- [x] Added React Query provider and typed HTTP client (`frontend/src/services/http.ts`) with structured errors, response validation, and abort handling.
- [x] Added frontend ESLint, typecheck, test, and build scripts.
- [x] Added six passing HTTP-client tests.
- [x] Fixed React lint issues in the legacy dashboard and root mounting.
- [x] Excluded generated `*.tsbuildinfo` from version control.
- [x] Updated backend and frontend Vitest dependencies; previously critical npm audit findings were eliminated.
- [x] Verified that the legacy dashboard loads and role switching works in the browser.
- [x] Foundation commit pushed to `feature/web-foundation` (reported by owner; verify with `git log` when resuming).

**Last confirmed checks:** frontend 6/6 tests; ESLint passes; frontend TypeScript passes; production build passes; backend 12/12 tests. Vite emits nonfatal `"use client"` warnings from dependencies.

**Known unfinished foundation items:**

- [ ] Replace legacy `frontend/src/api.ts` gradually with centralized `services/http.ts` and endpoint-specific Zod schemas.
- [ ] Create actual shared contracts in `shared/contracts` **with backend coordination**; the package existed but had no schema source files at last inspection.
- [ ] Integrate session state and query invalidation consistently; current provider is only a base QueryClient.
- [ ] Enforce feature import boundaries once modules are migrated.
- [ ] Configure and enforce formatting checks, accessibility checks, and CI frontend gates.
- [ ] Review remaining nine *moderate* `minimatch` development-tool advisories; do not use `npm audit fix --force` blindly.

## 2. Five-phase frontend plan

### Phase 1 — Foundation — COMPLETE

See checkpoint above. Do not redo this phase.

### Phase 2 — Core application — NEXT

**2A. Application shell**

- [ ] Responsive desktop sidebar and mobile navigation.
- [ ] Persistent `SANDBOX DEMO` banner on every route.
- [ ] Role-aware navigation and session/role switcher (five demo roles: organiser, reviewer, sponsor, resident, admin).
- [ ] Common page header, cards, buttons, form fields, status chips, and money display components.
- [ ] Route-level loading, empty, error, forbidden, and not-found states.
- [ ] Keyboard navigation, accessible labels, and responsive layout tests.

**2B. Project workspace (page/workflow 0)**

- [ ] Migrate working project creation, selection, details, budget editor, and milestone editor out of legacy `App.tsx`.
- [ ] Replace raw JSON editing with validated forms, while preserving backend payload formats.
- [ ] Wire TanStack Query caching, mutations, and invalidation.
- [ ] Support the AI project brief when P1's contract/endpoint is ready; label AI output advisory.
- [ ] Test role permissions and critical create/edit flows.

**2C. Reality Check (page/workflow 1)**

- [ ] Feasibility inputs, scenario comparison, funding gap and household contribution breakdown.
- [ ] Show AI-recommended funding mix only when backed by a real P1 integration or explicitly labeled simulation.
- [ ] Accept funding plan with confirmation and server-driven state updates.
- [ ] Never represent estimated/accepted funding as received money.

### Phase 3 — Funding experience

- [ ] **2 — Contribution checkout:** PayPal **sandbox** contribution flow; rely on P2 server-side payment/webhook verification, not browser success redirects.
- [ ] **3 — Public project page:** mobile-first public project details, budgets, milestones, verified funding state, and accessible sharing.
- [ ] **4 — Sponsor slot page:** browse and claim funding slots; distinguish reserved/claimed from actually paid/verified.
- [ ] Integrate P2's contribution, slot, and payment contracts when available.

### Phase 4 — Governance and delivery

- [ ] **5 — Evidence upload:** files, metadata, upload progress, and submission states; coordinate with P4.
- [ ] **6 — Review queue:** AG Grid with filters, status, evidence links, role permissions, and neutral review language.
- [ ] **7 — Release console (CRITICAL; do not cut):** Gate A/B checks, human approvals, audit trail, and server-authoritative release state; never imply frontend controls alone authorize money movement.
- [ ] **8 — Completion proof:** milestone completion and proof states; coordinate with P4.
- [ ] **9 — Mobile token attestation (CRITICAL; do not cut):** resident verification/attestation flow with token privacy and mobile usability.

### Phase 5 — Transparency, integration, and release

- [ ] **10 — Ledger and funding stack:** verified transactions and funding-source breakdown; clearly mark simulated payout rows `SIMULATED`.
- [ ] **11 — Sponsor proof pack:** downloadable/shareable sponsor-facing proof view using verified records.
- [ ] **12 — Q&A box:** questions, answers, moderation/permissions, and empty/error states.
- [ ] End-to-end integration with P1 (AI), P2 (payments/ledger/release), and P4 (evidence/completion/attestation).
- [ ] Accessibility, responsive/mobile, security, and permission testing across all roles.
- [ ] Production configuration, environment validation, CI, deployment, and smoke tests.

## 3. Architecture and non-negotiable rules

- **Preserve the existing functional dashboard** until its features are migrated and tested.
- New frontend features should use `frontend/src/services/http.ts` as the sole `fetch` boundary; the legacy `api.ts` remains a temporary exception.
- Validate API data at boundaries with Zod; **do not invent backend response contracts**.
- Use React Router for navigation, TanStack Query for server state, React Hook Form + Zod for forms, and AG Grid Community for the review queue.
- All monetary amounts are **integer USD cents** in data/contracts. Format at presentation boundaries; prefer `@neighbourfund/money` once its actual exports are confirmed.
- Distinguish **verified**, **claimed**, **pending**, **unknown**, and **simulated** states; never infer payment confirmation from UI actions.
- Show `SANDBOX DEMO` throughout. Mark simulated payouts `SIMULATED`.
- AI is advisory; financial and release decisions require authorized human/backend approval.
- No secrets in frontend code, no mock data embedded in production components, no unsupported paid/verified claims.
- Feature-first organization; keep modules small and tests adjacent to the code they cover.
- Coordinate backend contracts and route ownership with P1/P2/P4 rather than modifying teammates' work unilaterally.

## 4. Resume safely after working on other branches

From repository root (`C:\Users\acer\Desktop\NeighbourFund-AI`):

```powershell
git status --short
git switch feature/web-foundation
git pull --ff-only origin feature/web-foundation
npm install
npm run lint -w @neighbourfund/frontend
npm run typecheck -w @neighbourfund/frontend
npm run test -w @neighbourfund/frontend
npm run test:api
npm run build -w @neighbourfund/frontend
```

**Before switching away now:**

```powershell
git status --short
git add ToDo.md
git commit -m "docs(frontend): add phased frontend handoff and TODO"
git push origin feature/web-foundation
```

Only switch branches when `git status --short` is empty or you have deliberately committed/stashed unrelated changes. If teammates change `main`, review integration carefully before rebasing/merging; avoid overwriting P1/P2/P4 work.

**When resuming:** start with **Phase 2A — Application shell**. Build and verify one slice at a time. Do not start payment/evidence pages before their relevant backend contracts are agreed.

## 5. Useful local commands

```powershell
# Terminal 1: backend
npm run dev:api

# Terminal 2: frontend
npm run dev -w @neighbourfund/frontend

# Browser: http://localhost:5173
# Backend: http://localhost:4000

# Checks
npm run lint -w @neighbourfund/frontend
npm run typecheck -w @neighbourfund/frontend
npm run test -w @neighbourfund/frontend
npm run test:api
npm run build -w @neighbourfund/frontend
```

Local PostgreSQL was previously run in Docker as `neighbourfund-postgres` on host port `5433`; start it only if backend/database-dependent flows require it.

## 6. Completion definition for each page

- [ ] Route and role permissions work.
- [ ] Real backend integration or explicitly labeled mock/simulation, never misleading data.
- [ ] Loading, empty, error, success, and forbidden states handled.
- [ ] Forms validated; financial values and status language accurate.
- [ ] Keyboard and mobile usability checked.
- [ ] Tests added; lint, typecheck, tests, and build pass.
- [ ] Browser smoke test completed; no regressions to existing flows.

---

**Next action when returning:** implement Phase 2A on `feature/web-foundation`, then Phase 2B and 2C. Keep this checklist updated as work lands.
