# P2 Batch 2 verification package (development / sandbox only)

Overlay these files onto the previously installed Batch 2 scaffold on `feature/p2-money-core`. Existing `backend/src/app.ts` route registration remains unchanged.

## Improvements
- PayPal API calls no longer hold PostgreSQL transactions open.
- Integer-only cents formatting.
- Capture is checked against PayPal order and expected amount before a transactional status change and journal posting.
- Webhook signature verified through PayPal's `verify-webhook-signature` API before processing.
- Event IDs are stored and duplicate events are recognized; capture journal is unique by provider capture ID.
- PayPal capture order association is independently fetched before posting.

## Important limitations / release blockers
- **Not production-ready. Do not enable real payments or frontend checkout yet.**
- Integration tests against PostgreSQL and PayPal Sandbox are still required; only new exact-money unit tests are bundled.
- This package does NOT implement refund/dispute handling, event retry worker, payout release gates, or reconciliation worker.
- Some PayPal events may not carry `supplementary_data.related_ids.order_id`; these return 422 until a fallback lookup is implemented.
- A failed database write after capture requires a retry or reconciliation; automatic scheduled reconciliation is not yet implemented.
- The webhook event store is not transactionally coupled to journal posting; retrying is supported but a worker is still needed.
- PayPal's `PayPal-Request-Id` retention is time-limited; verify retry windows with provider docs.
- If multiple independent captures appear for one order, processing fails closed pending manual investigation.
- Sandbox `PAYPAL_WEBHOOK_ID` is required for signature verification; configure it from the PayPal Developer Dashboard after exposing a reachable HTTPS endpoint.
- Existing demo role switcher is not production authentication.
- Never store PayPal secrets in Git, and never trust client redirects as proof of capture.

## Verify
Run `powershell -ExecutionPolicy Bypass -File .\VERIFY-BATCH2.ps1`.

## Webhook setup
1. Expose the local backend through an HTTPS tunnel or deploy a sandbox backend.
2. In PayPal Developer Dashboard > Apps & Credentials > NeighbourFund-AI, add a webhook URL `https://<public-host>/api/paypal/webhook`.
3. Subscribe at minimum to `PAYMENT.CAPTURE.COMPLETED`.
4. Copy the webhook ID to `PAYPAL_WEBHOOK_ID` in your local `.env`; restart the backend.
5. Verify webhook delivery and retries using the PayPal Sandbox dashboard. PayPal's webhook simulator may require separate handling and must not be assumed equivalent to a real signed capture event.
