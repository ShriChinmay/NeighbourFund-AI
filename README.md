# NeighbourFund-AI

**Community projects deserve transparent funding, practical planning, and verifiable progress.**

NeighbourFund-AI is a hackathon prototype for turning neighborhood needs—such as safer street lighting, drainage repairs, and public-space improvements—into structured community projects. It brings residents, organizers, sponsors, and reviewers into a shared workflow for planning, funding, and tracking local initiatives.

**Built for the PayPal AI Hackathon 2026.**

> **Prototype notice:** This repository is under active integration. The default branch contains the platform and funding foundation; PayPal Sandbox functionality and AI/evidence modules have been developed on separate feature branches. Check the [implementation status](#implementation-status) before interpreting a feature as available in the default-branch application. No real-money payments are supported by the Sandbox implementation.

## The problem

Small community improvements can stall because residents cannot easily agree on fair contributions, sponsors lack visibility into funding needs, and there is no shared record of how funds relate to budgets and milestones. Project organizers also need a way to communicate plans clearly and demonstrate progress.

## Our approach

NeighbourFund-AI organizes the process into a connected journey:

1. **Propose:** An organizer creates a project with a community, funding goal, budget, and milestones.
2. **Assess:** Funding workflows help structure household contributions and sponsor participation.
3. **Contribute:** The PayPal Sandbox integration supports test payment intents, order approval, capture verification, and ledger entries on its feature branch.
4. **Review:** Evidence and completion workflows are being integrated to support accountability for expenses and milestones.
5. **Explain:** AI workflows are being developed to assist with project briefs, funding explanations, evidence review, and related structured tasks. AI output is advisory—not authorization for money movement.

## Features and implementation status

| Area | Current status |
| --- | --- |
| React web application | Frontend foundation available on `main`; end-to-end feature integration is ongoing |
| Demo role-based access | Implemented on `main` for organizer, reviewer, resident, sponsor, and admin roles |
| Projects, budgets, milestones, funding | Platform APIs and PostgreSQL schema available on `main` |
| PayPal Checkout | Sandbox order creation and verified capture on `feature/p2-money-core`; not yet merged into `main` at README preparation time |
| Double-entry ledger | Payment journal and database constraints on `feature/p2-money-core` |
| AI workflows | Developed on `feature/p1-ai-module`; integration into the running application pending verification |
| Evidence and completion | Developed on `feature/p4-evidence-completion`; integration pending verification |
| Public deployment | Being prepared; no verified public URL included yet |

This table is a snapshot of the repository when this README was prepared. Check branch history and the latest commits for subsequent integration work.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| API | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL, SQL migrations |
| Payments | PayPal Orders API and webhook verification (Sandbox branch) |
| AI | TypeScript AI package, provider abstractions and workflows (AI branch) |
| Testing | Vitest, Supertest |
| Repository | npm workspaces |

## Run locally

### Prerequisites

- Node.js **22 or newer** and npm
- PostgreSQL (local installation or Docker)
- Git

### 1. Clone and install

```bash
git clone https://github.com/ShriChinmay/NeighbourFund-AI.git
cd NeighbourFund-AI
npm install
```

### 2. Configure the environment

Copy the supplied example configuration into a local `.env` file:

```powershell
# PowerShell
Copy-Item .env.example .env
```

Configure `DATABASE_URL` to point to your PostgreSQL instance. For example, if PostgreSQL is mapped to port 5433:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/neighbourfund
APP_BASE_URL=http://localhost:5173
```

Use your own database password. Do not commit `.env`, API keys, webhook secrets, or credentials.

### 3. Create tables

Create the database named in `DATABASE_URL` if it does not exist, then run:

```bash
npm run db:migrate
npm run db:check
```

The migration runner applies numbered SQL migrations and tracks their checksums. Do not modify previously applied migrations.

### 4. Start the API

```bash
npm run dev:api
```

The default API port is `4000`. Verify it at `http://localhost:4000/api/health`.

### 5. Start the frontend

In another terminal:

```bash
npm run dev --workspace=@neighbourfund/frontend
```

Open `http://localhost:5173`.

> **Demo authentication:** The repository includes synthetic demonstration accounts and a role-switch endpoint. This is not production authentication. In production mode, the role-switch endpoint requires explicit configuration and an access key.

### 6. Run tests

```bash
npm run typecheck:api
npm run test:api
npm run build --workspace=@neighbourfund/frontend
```

These commands verify the checked-out revision; they do not automatically validate unmerged feature branches.

## PayPal Sandbox integration

The payment implementation on [`feature/p2-money-core`](https://github.com/ShriChinmay/NeighbourFund-AI/tree/feature/p2-money-core) includes:

- Payment intents associated with projects and authenticated demo users
- PayPal Sandbox order creation and approval flow
- Capture verification against PayPal's API
- Idempotent persistence of verified captures
- Double-entry ledger journals with database-level constraints
- Verified webhook handling with transaction-based processing

The team has tested a Sandbox capture, but live webhook delivery, fee reconciliation, refunds, disputes, and production security hardening are not claimed complete. Sandbox payments do not transfer real money.

For the payment feature branch, configure PayPal Sandbox credentials as required by its integration and documentation. Never expose secrets in screenshots, commits, or demo videos.

## AI integration

The [`feature/p1-ai-module`](https://github.com/ShriChinmay/NeighbourFund-AI/tree/feature/p1-ai-module) branch contains TypeScript AI workflow modules and provider abstractions. Intended uses include drafting project briefs, supporting funding explanations, and analyzing evidence or discrepancies.

AI recommendations are **assistive**. Payment capture, ledger updates, and release decisions must be governed by verified backend events and explicit authorization—not model-generated text. Confirm which AI workflows are reachable from the submitted build before recording the demo.

## Repository layout

```text
NeighbourFund-AI/
├── frontend/       # React + Vite web application
├── backend/        # Express API and platform modules
├── ai/             # AI workflow package
├── shared/         # Shared TypeScript packages
├── db/migrations/  # Versioned PostgreSQL schema
├── docs/           # Implementation and integration notes
├── tests/          # Test and fixture directories
├── package.json    # npm workspace scripts
└── LICENSE         # MIT license
```

## Demo and screenshots

The project demo video and screenshots will be linked here when available. Until then, the local setup instructions above provide the starting point for evaluating the application.

- **Demo video:** Pending publication
- **Live application:** Pending deployment confirmation
- **Source code:** https://github.com/ShriChinmay/NeighbourFund-AI

## Safety and limitations

NeighbourFund-AI is a hackathon prototype, not a production financial service. Payment operations are implemented against PayPal Sandbox. Demo users are synthetic, and certain modules are still being integrated. Do not use the prototype to collect real contributions or store sensitive financial information.

## License

Released under the [MIT License](LICENSE). Copyright © 2026 Chinmay Shrivastav.
