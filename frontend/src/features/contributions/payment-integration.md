# Payment integration contract — P2 handoff

The current backend exposes public project details, funding slots, feasibility and plan acceptance, but no contribution or PayPal routes. **Do not fabricate checkout success, paid totals, verification or receipts.**

Required P2-backed capabilities before enabling checkout:

1. Authenticated or explicitly authorized checkout creation for residents and sponsors, with project ID, validated amount in minor units, and optional budget slot ID. Server verifies funding status and permissions.
2. Provider order creation on the server; only server-generated checkout URL/order identifiers returned to the client.
3. Server-side capture or webhook verification, with idempotency and signature checks. Client redirects are never proof of payment.
4. Read-only payment history and aggregate endpoint with explicit `pledged`, `pending`, `paid`, `verified`, `failed`, `cancelled` semantics and consistent currency.
5. Authorization rules and refund/dispute handling, plus sandbox integration tests.
6. Confirmed endpoint paths, JSON schemas, error responses and authentication requirements.

The UI's paymentCapability flag must only be enabled when these contracts are implemented, integrated and tested. Do not change it solely to enable a button.
