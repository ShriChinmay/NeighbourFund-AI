# Phase 3 consolidated UI

Routes: `/p/:id` public project, `/contribute/:id` resident review, `/sponsor/:id` sponsorship review. The existing `/projects`, `/funding`, `/legacy` routes are preserved.

This package **does not** claim PayPal integration or actual paid/verified progress, because no checkout, payment history or webhook endpoint is registered in the current backend. See `features/contributions/payment-integration.md` for the P2 handoff contract.

The public project and slot views are live API integrations. Resident/sponsor amounts are locally validated but never submitted as payments. A review action is not a pledge or reservation.
