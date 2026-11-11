# NeighbourFund database rules

- PostgreSQL is the single source of truth. Each owner contributes a **new numbered SQL migration**; never edit an already-applied migration.
- P3 owns `001_platform_funding.sql`; P2/P4/P1 own their own tables and migrations. Coordinate migration number allocation before merging.
- UUID primary keys, UTC timestamptz, `snake_case` SQL, `camelCase` JSON, USD integer cents in `*_minor BIGINT`.
- Do not use JavaScript `Number` for unsafe large BIGINT values. The `pg` driver returns BIGINT as strings by default; validate and convert only within `Number.MAX_SAFE_INTEGER` where required.
- `audit_events` is append-only. Use the platform audit service (Step 3) for writes.
- For production use a dedicated least-privileged application DB role and a separate migration role. Do not use a superuser as the production API login.
- Cross-module access should go through service interfaces, not other modules' repositories.
- `DATABASE_URL` belongs in root `.env`, never commit it.