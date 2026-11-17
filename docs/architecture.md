
# CommerceFlow — PostgreSQL Modular Monolith

## Application Architecture

The API is a Node.js + Express modular monolith.

Business modules:
- Authentication and Users
- Catalog
- Inventory
- Cart
- Orders
- Payments and Refunds
- Reports

Infrastructure:
- PostgreSQL: Authoritative business state
- Redis: Cache, distributed rate limit state, BullMQ
- BullMQ: Background job processing
- Pino: Structured application logging

## Request Flow

HTTP Client
  -> Express Middleware
  -> Authentication and Authorization
  -> Input Validation
  -> Business Service
  -> Repository / PostgreSQL
  -> API Response

## Checkout Transaction

Cart lock
  -> Read products and prices
  -> Lock inventory
  -> Validate availability
  -> Reserve stock
  -> Insert order/items
  -> Clear cart
  -> Commit

## Payment Lifecycle

pending_payment
  -> paid
  -> refund_pending
  -> refunded

pending_payment
  -> cancelled

refund_pending
  -> paid (failed refund)

## Consistency Rules

- PostgreSQL is the source of truth.
- Catalog cache is eventually consistent.
- Order totals and money use integer minor units.
- Checkout uses a unique idempotency key.
- Stock reservation is transactional.
- Payments are not marked successful by client input.
- Payment events are authenticated in the local simulator.
- No financial side effect relies on Redis cache.
- Background jobs must tolerate retries and duplicates.

## Known Limitations

- Payment provider is a local simulator, not a real gateway.
- Late payment capture reconciliation is not implemented.
- One payment intent and one full refund per order.
- Outbox relay provides at-least-once delivery.
- Job processing failure recovery requires monitoring.
- Cursor pagination is not a complete database snapshot.
- Catalog cache has bounded eventual staleness.
- CSV export has a maximum record limit.
- Metrics are in-process and reset on restart.
- No production TLS/reverse proxy is configured.
- PostgreSQL backup/restore drills are not automated.

## Performance Features

- PostgreSQL connection pooling
- Query parameterization
- Indexes aligned with Catalog queries
- Cursor pagination
- Redis cache-aside
- Cache generation invalidation
- Stampede mitigation
- Redis-backed rate limiting
- Batched SQL queries
- CSV streaming with backpressure
- Runtime metrics

## Next Evolution

Implement an equivalent business system on MongoDB
and compare schema design, transactions, indexing,
query patterns, data modeling and scalability.
