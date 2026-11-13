### Phase 0 — Project foundation

- Node.js project initialization
- Express server
- Environment configuration
- Folder architecture
- Routing and controllers
- Service and repository layers
- Custom error classes
- Central error-handling middleware
- Request validation
- Authentication middleware foundation
- API versioning (/api/v1)
- Health-check endpoint
- Pino logging
- PostgreSQL connection
- Prisma migrations
- Graceful shutdown basics
- Testing with Jest/Vitest and Supertest

Problem we'll create: Poorly structured code, duplicated logic, inconsistent errors, unhandled failures and difficult debugging.

Solution: Production-grade modular architecture and centralized infrastructure.

### Phase 1 — Node.js internals and performance

- Event Loop
- Blocking vs non-blocking operations
- CPU-intensive operations
- Worker Threads
- Worker Thread Pool
- Child Processes
- spawn, exec, execFile, fork
- Cluster Module
- Streams
- Backpressure
- Memory leaks
- Heap snapshots
- Garbage collection
- Graceful shutdown
- Process signals

Problems we'll create:

1. A slow API that blocks other requests.
2. A report-generation API that consumes too much CPU.
3. A large file export that consumes excessive memory.
4. A process that crashes without releasing resources.
5. A server that uses only one CPU core.

How we'll investigate:

- console.time() for initial measurements
- perf_hooks
- Node.js inspector
- Chrome DevTools
- process.memoryUsage()
- --inspect
- Heap snapshots
- autocannon and k6 load testing

Important distinction: Worker Threads are for CPU-intensive JavaScript work. Child Processes let us execute separate programs or scripts. Cluster runs multiple Node.js processes. We'll demonstrate all three separately.

### Phase 2 — API performance and scalability

- Rate Limiting
- Redis
- Cache-Aside Pattern
- Cache Invalidation
- TTL
- Cache Stampede
- Pagination
- Cursor Pagination
- Database Query Optimization
- N+1 Query Problem
- Connection Pooling
- Compression
- Request Batching

Problems we'll create:

- A product endpoint receiving thousands of requests.
- The database executing the same query repeatedly.
- Many requests hitting the database simultaneously after cache expiry.
- An endpoint returning 100,000 records.
- Too many database connections.
- An API returning unnecessarily large JSON responses.

How we'll investigate:

- Response time (p50, p95, p99)
- Requests per second
- PostgreSQL EXPLAIN ANALYZE
- Redis monitoring
- Database connection counts
- Before/after load tests

### Phase 3 — Database engineering

We'll begin with PostgreSQL.

- Indexing
- Composite Indexes
- Transactions
- ACID Properties
- Isolation Levels
- Optimistic Locking
- Pessimistic Locking
- Deadlocks
- Replication
- Read Replicas
- Partitioning
- Sharding concepts
- Database Migrations
- Connection Pooling

Then MongoDB:

- Document modeling
- Embedding vs referencing
- Indexes
- Compound indexes
- Aggregation pipelines
- Transactions
- Schema validation
- Query optimization
- Change streams

Problems we'll create:

- Two users purchasing the last available item.
- Duplicate orders due to concurrent requests.
- Lost updates.
- Deadlocks caused by transaction ordering.
- Slow queries on large datasets.
- Product data becoming difficult to maintain.

We'll compare PostgreSQL and MongoDB where appropriate, not assume one is always better.

### Phase 4 — Background processing

- Message Queues
- BullMQ
- Redis-backed jobs
- Retry Mechanism
- Exponential Backoff
- Dead Letter Queue
- Idempotency
- Scheduled Jobs / Cron
- Pub/Sub
- Event-Driven Architecture
  Real example:

When a user creates an order, the API should not wait for:

- Confirmation email
- Invoice generation
- PDF generation
- Inventory notifications
- Analytics updates
  We'll move suitable work into background jobs.

Then we'll intentionally make jobs fail and understand retries, duplicate execution and failed-job recovery.

### Phase 5 — Backend reliability and distributed systems

- Timeouts
- Circuit Breakers
- Load Balancing
- Reverse Proxy (later, Nginx)
- Health Checks
- Horizontal Scaling
- Service Discovery
- Distributed Locks
- Eventual Consistency
- Saga Pattern
- Transactional Outbox

Real problems:

- Payment service stops responding.
- A downstream service is unavailable.
- A request hangs indefinitely.
- Two application instances update the same resource.
- An order is saved but its notification event is lost.
- A multi-service transaction partially succeeds.

We'll learn why distributed systems need more than database transactions.

### Phase 6 — Microservices

After modular monolith
We'll extract services from our existing application.

1. User Service
2. Product Catalog Service
3. Inventory Service
4. Order Service
5. Payment Service
6. Notification Service

We'll introduce:

- Service boundaries
- Independent deployments
- Inter-service communication
- RabbitMQ
- Service-to-service authentication
- Service discovery
- API Gateway
- Independent databases
- Event-driven communication
- Saga
- Transactional Outbox
- Distributed tracing

We'll compare the modular monolith against microservices and understand their operational costs.

### Phase 7 — Backend security

- JWT
- Refresh Token Rotation
- OAuth 2.0
- OpenID Connect
- RBAC
- SQL Injection
- XSS
- CSRF
- SSRF
- CORS
- Secrets Management
- Password hashing
- Input validation
- Security headers
- Request size limits

We'll test vulnerabilities in our own local development application and fix them.

### Phase 8 — Backend communication

We'll intentionally defer these until the core backend is working:

- WebSockets
- Server-Sent Events
- Long Polling
- Webhooks
- gRPC
- API Gateway

### Phase 9 — Monitoring and observability

This will run throughout the project, but we'll build a complete monitoring setup here.

- Pino
- Structured logging
- Correlation IDs
- Prometheus
- Grafana
- OpenTelemetry
- Distributed tracing
- Metrics
- Alerting
- CPU monitoring
- Memory monitoring
- Database monitoring
- API latency monitoring

Our goal: When an API becomes slow, we should be able to determine whether the bottleneck is Node.js, PostgreSQL, MongoDB, Redis, a queue, or another service.

### Phase 10 — Production deployment

Only after we understand the application:

- Docker
- Docker Compose
- Nginx
- AWS
- Environment configuration
- CI/CD
- Production deployment
- Process management
- Database backups
- Deployment rollback
- Horizontal scaling

### Phase 11 — Advanced topics

We'll revisit the advanced topics from your list when the project makes them relevant:

- Kafka
- Kubernetes
- Service Mesh
- CAP theorem
- Raft
- Vector Clocks
- Gossip Protocol
- Multi-region deployment
- Chaos Engineering
- Edge Computing
- CQRS
- Event Sourcing
- Consistent Hashing
- Lock-free Algorithms

### Important architectural rules

We will maintain clear responsibilities:

Routes - URL and HTTP method
Controllers - HTTP request/response
Services - Business logic
Repositories - Database operations
Middleware - Cross-cutting request logic
Workers - Background or CPU-intensive execution
Queues - Asynchronous job coordination
Config - Application configuration
Errors - Centralized error definitions

For example: POST /api/v1/orders

Route → Authentication middleware → Validation middleware → Controller → Order Service → Order Repository → PostgreSQL.

The controller won't contain database queries or complicated business logic.

### How we'll identify bottlenecks

For each experiment, we'll maintain a record like this:

`Metric	          Before	  After
Average latency	  Measured	Measured
p95 latency	      Measured	Measured
p99 latency	      Measured	Measured
Requests/second	  Measured	Measured
CPU usage	        Measured	Measured
Memory usage	    Measured	Measured
DB query count	  Measured	Measured`

We'll use the following tools:

Autocannon - Generate HTTP traffic and identify slow endpoints.
k6 - Simulate concurrent users and measure performance.
Grafana - Visualize API latency, CPU, memory and other metrics.
Prometheus - Collect and query application metrics.
OpenTelemetry - Trace requests across services and locate slow operations.

### How a Product request travels

1. Postman / Browser / curl
2. Express middleware - Request ID · Logging · Security · Body parsing
3. Routes + Validation - Match URL and validate incoming data
4. Controller - Handle HTTP request and response
5. Service - Business rules and application logic
6. Repository - Read or write data
7. Response - JSON response returned to client

### Create a dedicated database

1. sudo -u postgres psql
2. CREATE ROLE commerce_flow_user WITH LOGIN PASSWORD 'change_this_to_a_strong_password';
3. CREATE DATABASE commerce_flow OWNER commerce_flow_user;
4. \q

### Verify the database connection

`
node --input-type=module -e "
import { pool } from './src/config/database.js';

try {
const result = await pool.query('SELECT NOW() AS current_time');
console.log('PostgreSQL connected successfully!');
console.log(result.rows[0]);
} finally {
await pool.end();
}
"
`

### CONNECT POOL - max: 500,

- This means a single Node.js application process is allowed to hold up to 500 PostgreSQL connections in its pool.
- It does NOT immediately open all 500 connections. The pool generally creates connections as they are needed, up to its configured maximum.
- Imagine your application receives 500 requests simultaneously, each requiring a database query.

Why 500 connections can make PostgreSQL slower?

`Problem	              What happens when the pool is too large
Memory consumption	    PostgreSQL needs resources for more backend connections.
CPU contention	        More active queries compete for CPU time.
Context switching	      The operating system spends more time scheduling processes.
Lock contention	        More simultaneous queries may compete for the same rows or tables.
I/O contention	        More queries compete for disk and cache resources.
Connection exhaustion	  Other applications and admin tools may be unable to connect.
Latency increases	      Queries can take longer even though more connections are available.`

- PostgreSQL has a max_connections setting. Its default is commonly around 100, but the actual value depends on your installation and configuration.
- You can check yours with: SHOW max_connections;

Also check how many connections are currently being used:

`SELECT
    state,
    COUNT(*) AS connection_count
FROM pg_stat_activity
GROUP BY state
ORDER BY connection_count DESC;`

And inspect connection details:

`SELECT
    pid,
    usename,
    application_name,
    state,
    wait_event_type,
    wait_event
FROM pg_stat_activity;`

How should we choose the pool size?

There is no universal correct number. It depends on:

1. PostgreSQL server CPU and memory.
2. How expensive your SQL queries are.
3. How long queries hold connections.
4. How many application instances you run.
5. How much database traffic you expect.
6. Other applications sharing the database.

### Execute the migration

`psql -h localhost \
  -U commerce_flow_user \
  -d commerce_flow \
  -f src/database/migrations/001_create_products.sql
 `

- inspect the table: psql -h localhost -U commerce_flow_user -d commerce_flow
- table products: \d products
- Check whether the table is empty: SELECT \* FROM products;

### Generate 100,000 sample products for our performance experiment.

```
INSERT INTO products (
    id,
    name,
    description,
    price,
    stock,
    category
)
SELECT
    gen_random_uuid(),
    'Product ' || number,
    'Performance testing product',
    ROUND((RANDOM() * 100000 + 1)::NUMERIC, 2),
    FLOOR(RANDOM() * 1000)::INTEGER,

    -- Distribute products across four categories.
    CASE
        WHEN number % 4 = 0 THEN 'Electronics'
        WHEN number % 4 = 1 THEN 'Clothing'
        WHEN number % 4 = 2 THEN 'Books'
        ELSE 'Furniture'
    END
FROM generate_series(1, 100000) AS number;
```

- SELECT COUNT(\*) FROM products;

- PostgreSQL uses table statistics to estimate how many rows a query will return and decide which execution plan is likely to be cheaper. ANALYZE refreshes those statistics.
- ANALYZE products;

### Indexing

- Without an index, PostgreSQL may need to inspect rows one by one. This is called a Sequential Scan.
- With an index, PostgreSQL can use a data structure to locate matching rows without scanning the entire table.
- PostgreSQL commonly uses B-tree indexes by default. A B-tree keeps indexed values organized so the database can efficiently find matching entries.
- Important: PostgreSQL automatically creates an index for a PRIMARY KEY and UNIQUE constraint. Our products.id is already indexed because we defined it as a primary key.

What happens if you create too many indexes?

`Too few indexes	                  Too many indexes
Some reads become slow	            Writes become slower
More rows may need scanning	        More disk space is consumed
More CPU may be used for searches	  More maintenance and cache pressure
Filtering can become expensive	    Updates may require extra index work`

### Measure performance before creating an index

```
EXPLAIN (ANALYZE, BUFFERS)
SELECT
    id,
    name,
    price,
    created_at
FROM products
WHERE category = 'Electronics'
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

- Seq Scan - PostgreSQL reads rows by scanning the table.
- Filter - It checks which rows match the category.
- Sort - It orders matching rows.
- Limit - It returns only the first 20 rows.
- Execution Time - Measured execution time for this query.
- Buffers - Shows database pages accessed during execution.

### Create a composite index

We can create an index that supports both the category filter and the requested ordering.

- WHERE category = 'Electronics' ORDER BY created_at DESC, id DESC

```
CREATE INDEX idx_products_category_created_id
ON products (
    category,
    created_at DESC,
    id DESC
);
```

- This is called a composite index because it contains multiple columns.

Why this order?

- category comes first because we filter by it.
- created_at comes next because we sort by it.
- id comes last because it breaks ties in the sort order.

A useful distinction:

- shared hit means the required page was already in PostgreSQL's shared buffer cache.
- shared read means PostgreSQL had to read the page into that cache.

Check the table and index sizes:

```
SELECT
    pg_size_pretty(pg_relation_size('products')) AS table_size,
    pg_size_pretty(pg_indexes_size('products')) AS indexes_size,
    pg_size_pretty(pg_total_relation_size('products')) AS total_size;
```

List the indexes on your table:

```
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products';
```

What if we index every column?

- PostgreSQL has more indexes to maintain during writes.
- Database storage usage increases.
- Index pages compete for memory and cache.
- Some indexes may be redundant and provide little additional benefit.

- Remove Index: DROP INDEX idx_products_category_created_id;

### Offset vs Cursor-Based Pagination

```
SELECT *
FROM products
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 50000;
```

- PostgreSQL cannot simply jump to the 50,001st row in an ordered result using a normal B-tree index.
- It generally needs to process the preceding 50,000 entries before returning the next 20.

- Instead of saying: Skip 50,000 products and give me the next 20.
- We say: Give me 20 products that come after this particular product in the ordering.

- The cursor stores the last product's created_at and id.

```
SELECT *
FROM products
WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

### When should you use each approach?

```
Feature	                                      OFFSET pagination	              Cursor pagination
Simple implementation	                        Excellent	                      More complex
Jump directly to page 100	                    Yes	                            Not naturally
Large dataset performance	                    Can degrade with deep pages	    Often much better
New records inserted between requests	        Can cause duplicates or skips	  More stable for a fixed ordering
Suitable for infinite scrolling	              Yes, but less ideal	            Excellent
Suitable for admin tables with page numbers	  Excellent	                      Depends on requirements
```

### PostgreSQL Transactions, ACID and Concurrency

```
Property	        Meaning	                                                                          CommerceFlow example
A — Atomicity	    All operations succeed, or none are committed	                                    Don't create an order if inventory cannot be deducted
C — Consistency	  Database constraints and defined invariants remain valid	                        Stock cannot become negative; sales must have valid order records
I — Isolation	    Concurrent transactions follow defined visibility and interference rules	        Customers cannot both claim the last item
D — Durability	  Committed changes survive failures under the database's durability guarantees	    Restarting Node.js doesn't erase an order
```

```
BEGIN;

UPDATE products
SET stock = stock - 1
WHERE id = 'PRODUCT_UUID';

INSERT INTO orders (...);

COMMIT;
```

- BEGIN starts the transaction.
- UPDATE changes inventory.
- INSERT creates an order.
- COMMIT makes the transaction's changes permanent.

- If an operation fails, we use: ROLLBACK;

### Deliberately reproduce an overselling bug

- Terminal A — Customer A reads the inventory

```
BEGIN;

SELECT stock
FROM products
WHERE id = 'YOUR_PRODUCT_UUID';
```

- Terminal B — Customer B reads the same inventory

```
BEGIN;

SELECT stock
FROM products
WHERE id = 'YOUR_PRODUCT_UUID';
```

- Terminal A — Creates the order

```
UPDATE products
SET stock = 0
WHERE id = 'YOUR_PRODUCT_UUID';

INSERT INTO orders (
    id, product_id, quantity, unit_price, total_amount
)
VALUES (
    gen_random_uuid(),
    'YOUR_PRODUCT_UUID',
    1,
    80000,
    80000
);

COMMIT;
```

- Terminal B — Creates another order using stale information

```
UPDATE products
SET stock = 0
WHERE id = 'YOUR_PRODUCT_UUID';

INSERT INTO orders (
    id, product_id, quantity, unit_price, total_amount
)
VALUES (
    gen_random_uuid(),
    'YOUR_PRODUCT_UUID',
    1,
    80000,
    80000
);

COMMIT;
```

- Fix it using an atomic conditional UPDATE

```
UPDATE products
SET stock = stock - 1
WHERE id = 'YOUR_PRODUCT_UUID'
  AND stock >= 1
RETURNING id, price, stock;
```

- But why do we still need a transaction?

```
Imagine the first operation succeeds, but the second fails due to a database constraint or another error.

Without a transaction, inventory remains deducted even though no order exists.
```

```
BEGIN;

UPDATE products
SET stock = stock - 1
WHERE id = 'YOUR_PRODUCT_UUID'
  AND stock >= 1
RETURNING id, price;

INSERT INTO orders (...);

COMMIT;
```

### PostgreSQL Transaction Isolation Levels

PostgreSQL supports these four SQL isolation levels:

- Read Uncommitted Behaves like Read Committed
- READ COMMITTED — Each statement sees a fresh committed snapshot (Har query ko latest committed data)
- REPEATABLE READ — Transaction reads use a stable snapshot (Ek transaction mein same snapshot)
- SERIALIZABLE — Concurrent transactions must behave as though executed in some serial order, or one is rejected (Result aisa ho jaise transactions ek-ek karke chali hon)

- PostgreSQL's default is READ COMMITTED.

# READ COMMITTED

- Products list karna.
- Order create karna, jab stock safely conditional update se deduct ho.
- Normal CRUD operations.

# REPEATABLE READ

- Stock 10 hai.
- Customer A transaction start karta hai, stock 10 dekhta hai.
- Customer B stock 5 kar deta hai aur commit bhi kar deta hai.
- Lekin Customer A jab apni purani transaction mein dobara read karega, usse ab bhi 10 dikhega.

Maan le tum ek financial report bana rahe ho jisme multiple SQL queries chalti hain.

- Pehli query total sales count karti hai.
- Doosri query sales amount calculate karti hai.
- Beech mein naye orders aa rahe hain.

- await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

- Agar tumhare transaction ke snapshot ke baad doosri transaction kisi row ko update kar chuki hai aur tum bhi us row ko update karna chahte ho, PostgreSQL serialization error de sakta hai. Aisi condition mein transaction retry karni pad sakti hai.

# SERIALIZABLE

Maan le warehouse mein 2 employees hain.
Company ka rule hai:Kam se kam 1 employee available rehna chahiye.

Ab do admins ek hi time par:

- Admin A employee 1 ko unavailable kar raha hai.
- Admin B employee 2 ko unavailable kar raha hai.

Dono ne pehle check kiya aur dekha 2 available employees hain.
Agar dono changes commit ho gaye, toh 0 employees available bachenge.

- SERIALIZABLE mein PostgreSQL aise conflicting transaction patterns detect karke ek transaction ko reject kar sakta hai.

- await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

- Jab multiple rows ya queries ke beech koi important business rule maintain karna ho aur simple atomic updates ya row locking se use safely enforce karna difficult ho.

Examples:

- Booking systems mein complex allocation rules.
- Multiple accounts ya resources ke cross-row constraints.
- Financial workflows jahan several reads ke basis par dependent writes hoti hain.

- Kya dikkat hai? Kuch transactions 40001 serialization error ke saath fail ho sakti hain. Application ko poori transaction dobara execute karne ka retry mechanism banana padta hai.
