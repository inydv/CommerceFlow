# CommerceFlow — Final Development Plan

| Checkpoint | Complete Deliverable                                                                                                                  |
| :--------: | ------------------------------------------------------------------------------------------------------------------------------------- |
|   CP-01    | Complete Node.js + Express + PostgreSQL setup, environment validation, Pino logging, error handling, health checks, graceful shutdown |
|   CP-02    | Database migrations + Users, Auth, JWT, refresh tokens, RBAC                                                                          |
|   CP-03    | Catalog + Categories + Products CRUD + SQL queries + large-data seeding + pagination                                                  |
|   CP-04    | Inventory + Cart + Orders + transactions + isolation levels + idempotency                                                             |
|   CP-05    | Payments + Webhooks + Refunds + BullMQ + retries + DLQ + transactional outbox                                                         |
|   CP-06    | Redis caching + rate limiting + query optimization + indexing + N+1 + performance + bulk requests                                     |
|   CP-07    | Node.js internals experiments, workers, streams, memory profiling, monitoring, resilience, security and final integration             |
|   CP-08    | Full documentation + Postman collection + benchmarks + deployment                                                                     |

======================================================================================================

# ES Modules enable.

npm pkg set type=module

# Accidental npm publishing prevent.

npm pkg set private=true

# Supported Node.js version document.

npm pkg set 'engines.node=>=24'

======================================================================================================

# Apply database changes first.

npm run db:migrate

# Generate 1,000 products.

npm run db:seed -- small

# Increase cumulative seed dataset to 10,000.

npm run db:seed -- medium

# Increase to 100,000 (if machine resources permit).

npm run db:seed -- large

======================================================================================================

# webhook event simulate karne ke liye

npm run demo:webhook -- payment.succeeded PAYMENT_INTENT_UUID
npm run demo:webhook -- payment.failed YOUR_NEW_PAYMENT_INTENT_UUID

======================================================================================================

# PostgreSQL query optimization script

psql -U commerceflow_user \
 -h 127.0.0.1 \
 -d commerceflow_db \
 -X \
 -v ON_ERROR_STOP=1 \
 -f scripts/sql/005_performance.sql

======================================================================================================
