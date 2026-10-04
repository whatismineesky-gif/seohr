# PostgreSQL migration

The application has a PostgreSQL adapter for its existing database API. Each operation opens a client through Hyperdrive; each batch uses a single transaction and closes the client afterwards. A failed batch rolls back submissions and their notification together. Parameters remain bound values, and timestamps retain the existing UTC text format.

## Staged deployment

`scripts/deploy-cloudflare.mjs` binds `HYPERDRIVE` to configuration `d788523963fc47e4a0eb262772b6cb92` and explicitly keeps `DATABASE_PROVIDER=d1`. D1 remains the source of truth during connection verification. There is no automatic fallback between providers, which would split writes between two databases.

An authenticated HR can open `/api/database-status` to verify the Worker → Hyperdrive → Tunnel → PostgreSQL path. This endpoint reads counts only and returns no employee details or connection credentials. An unauthenticated request is denied; other roles cannot access it.

## Cutover prerequisites

1. Verify the endpoint succeeds with 54 tables, 7 notification triggers and the expected counts for the imported snapshot.
2. Pause all business writes and external integration requests during final synchronization. Announcements alone do not freeze login/session changes, notification read receipts or integration request counters; those also need reconciliation or an explicit temporary maintenance gate.
3. Export a fresh D1 snapshot. Back up PostgreSQL and synchronize all changes since the initial export, including users, sessions, submissions, attendance, announcements and notification reads. Do not re-run the initial import against the populated database; its empty-database guard intentionally rejects that.
4. Compare all rows, foreign keys and identity sequence highwater values. Keep historical imports from generating new notifications.
5. Change the deploy script to `DATABASE_PROVIDER=postgres` and use a PostgreSQL migration workflow. D1 migration files cannot be applied directly to PostgreSQL. Keep the D1 binding for the initial transition, but never write to D1 after cutover.
6. Validate login, attendance, check-in, daily review, submissions, notification ownership, warning totals, payroll and the external date-filtered API before reopening writes.

Rollback after PostgreSQL has accepted writes requires synchronizing those writes back first. Switching the provider alone would lose recent changes.

## Verification

Run `node --test tests/*.test.mjs` and `npm run build`. The PostgreSQL adapter tests cover bound values, case-insensitive identity matching, UTC timestamps, generated IDs, notification source IDs, transaction rollback and client cleanup. The import and application query paths were additionally exercised against a local PostgreSQL WASM engine with the exported snapshot; the real VPS path is checked separately through the HR endpoint.
