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

### How we'll identify bottlenecks

For each experiment, we'll maintain a record like this:

`Metric	          Before	  After
Average latency	  Measured	Measured
p95 latency	      Measured	Measured
p99 latency	      Measured	Measured
Requests/second	  Measured	Measured
CPU usage	      Measured	Measured
Memory usage	  Measured	Measured
DB query count	  Measured	Measured`

We'll use the following tools:

Autocannon - Generate HTTP traffic and identify slow endpoints.
k6 - Simulate concurrent users and measure performance.
Grafana - Visualize API latency, CPU, memory and other metrics.
Prometheus - Collect and query application metrics.
OpenTelemetry - Trace requests across services and locate slow operations.

### Backend Architecture

We will maintain clear responsibilities:

Router - Kaunsa URL kis controller ko execute karega
Middleware - Controller se pehle request par processing
Controller - Request receive karke response bhejna
Service - Business logic
Repository - Database queries
Validation - Request data correct hai ya nahi, check karna
DTO - Data Transfer Object — layers/client ke beech data ka defined structure
Modular Monolith - Ek application, lekin features alag modules mein
Workers - Background or CPU-intensive execution
Queues - Asynchronous job coordination
Config - Application configuration
Errors - Centralized error definitions

For example: POST /api/v1/orders

Route → Authentication middleware → Validation middleware → Controller → Order Service → Order Repository → PostgreSQL.
