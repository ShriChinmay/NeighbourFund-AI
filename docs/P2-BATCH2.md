# P2 Batch 2 — PayPal Sandbox checkout (staged implementation)

This overlay introduces server-side PayPal Sandbox order creation and capture for existing payment intents. It does **not** enable public checkout automatically. Add `paypalRouter` to app.ts and configure `.env` locally. **Do not deploy this code to production or expose checkout yet.**

## Required security follow-ups before activation

- Verify order purchase unit reference ID/custom ID, amount and currency against the persisted intent **before capture**, not just capture response afterward.
- Build a separately verified, durable webhook ingestion endpoint; validate PayPal signature using a configured webhook ID; persist and deduplicate event IDs; reconcile webhook/capture races.
- Handle HTTP timeouts, unknown capture outcomes, retries and recovery. Avoid holding DB row locks across PayPal network requests.
- Add authenticated history/aggregate endpoints, refunds and disputes, CSRF protection for cookie-based payment mutations, rate limiting, and funding-capacity checks under concurrency.
- Write database-backed integration tests and PayPal Sandbox end-to-end tests.
- Check PayPal fees, currency availability, merchant eligibility and country restrictions. Sandbox success does not establish live payout eligibility.

## Config

`PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID=...`, `PAYPAL_CLIENT_SECRET=...` (all in untracked `.env`). Webhook ID will be needed for a future verified webhook route.

## Current state

Only authenticated payer-owned intents may create and capture orders. Capture is recorded as `captured` only when PayPal reports a single completed USD capture of the expected amount; a balanced ledger journal is written in the same DB transaction. This is a **development scaffold**, not a completed Batch 2 release.
