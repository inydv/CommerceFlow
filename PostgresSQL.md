====================================================================================================

# Create a dedicated database

1. sudo -u postgres psql
2. CREATE ROLE commerce_flow_user WITH LOGIN PASSWORD 'change_this_to_a_strong_password';
3. CREATE DATABASE commerce_flow OWNER commerce_flow_user;
4. \q

# Verify the database connection

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

# Execute the migration

`psql -h localhost \
  -U commerce_flow_user \
  -d commerce_flow \
  -f src/database/migrations/001_create_products.sql
 `

- inspect the table: psql -h localhost -U commerce_flow_user -d commerce_flow
- table products: \d products
- Check whether the table is empty: SELECT \* FROM products;

# Generate 100,000 sample products for our performance experiment.

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

====================================================================================================

# Connection Pooling

- This means a single Node.js application process is allowed to hold up to 500 PostgreSQL connections in its pool.
- It does NOT immediately open all 500 connections. The pool generally creates connections as they are needed, up to its configured maximum.
- Imagine your application receives 500 requests simultaneously, each requiring a database query.

```
max	                        Pool mein maximum connections
idleTimeoutMillis	        Idle connection kitni der baad close ho sakta hai
connectionTimeoutMillis     Connection acquire karne ke liye maximum wait
pool.query()	            Query execute karta hai aur connection automatically release karta hai
pool.connect()	            Connection manually borrow karta hai
client.release()	        Borrowed connection return karna
Pool Exhaustion	            Pool ke saare connections busy/borrowed hona
Connection Leak	            Connection borrow karke return na karna
Connection Contention	    Requests ka limited connections ke liye compete karna
PgBouncer	                PostgreSQL ke liye external connection pooler
```

### Why 500 connections can make PostgreSQL slower?

`Problem	            What happens when the pool is too large
Memory consumption	    PostgreSQL needs resources for more backend connections.
CPU contention	        More active queries compete for CPU time.
Context switching	    The operating system spends more time scheduling processes.
Lock contention	        More simultaneous queries may compete for the same rows or tables.
I/O contention	        More queries compete for disk and cache resources.
Connection exhaustion	Other applications and admin tools may be unable to connect.
Latency increases	    Queries can take longer even though more connections are available.`

- PostgreSQL has a max_connections setting. Its default is commonly around 100, but the actual value depends on your installation and configuration.
- You can check yours with: SHOW max_connections;

### Check how many connections are currently being used:

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

### How should we choose the pool size?

There is no universal correct number. It depends on:

1. PostgreSQL server CPU and memory.
2. How expensive your SQL queries are.
3. How long queries hold connections.
4. How many application instances you run.
5. How much database traffic you expect.
6. Other applications sharing the database.

====================================================================================================

# Connection Pool Performance

- pool.totalCount - Kitne connections currently pool mein exist karte hain
- pool.idleCount - Kitne connections free hain
- pool.waitingCount - Kitni requests connection ka wait kar rahi hain

- Har query PostgreSQL mein intentionally 200 milliseconds wait karegi: SELECT pg_sleep(0.2);
- pg_sleep() PostgreSQL ka function hai jo query ko specified duration tak pause karta hai.

- DB_POOL_MAX=2 node scripts/pool-experiment.js

- Agar humein poore PostgreSQL server ke connections dekhne hon, toh psql mein ye query run kar sakte hain:

```
SELECT
    application_name,
    state,
    COUNT(*) AS connections
FROM pg_stat_activity
WHERE datname = 'commerce_flow'
GROUP BY application_name, state
ORDER BY connections DESC;
```

```
SELECT
    pid,
    state,
    wait_event_type,
    wait_event,
    query
FROM pg_stat_activity
WHERE datname = 'commerce_flow';
```

- Yahan wait_event_type aur wait_event se pata chal sakta hai ki PostgreSQL backend kya wait kar raha hai.
- Lekin jo requests abhi Node.js pool ki queue mein hain, unke liye database backend connection allocate hi nahi hua hota. Isliye woh waiting requests PostgreSQL ki pg_stat_activity mein individual queries ke roop mein nahi dikhti.

- connectionTimeoutMillis - Connection obtain karne ke liye kitna wait karna hai
- query_timeout - Client-side query execution timeout
- statement_timeout - PostgreSQL mein SQL statement kitni der tak execute ho sakta hai
- lock_timeout - PostgreSQL lock acquire karne ke liye kitna wait kare

====================================================================================================

# Indexing

- Without an index, PostgreSQL may need to inspect rows one by one. This is called a Sequential Scan.
- With an index, PostgreSQL can use a data structure to locate matching rows without scanning the entire table.
- PostgreSQL commonly uses B-tree indexes by default. A B-tree keeps indexed values organized so the database can efficiently find matching entries.
- Important: PostgreSQL automatically creates an index for a PRIMARY KEY and UNIQUE constraint. Our products.id is already indexed because we defined it as a primary key.

- Query Planner - Decide karta hai query kaise execute hogi
- Execution Plan - Query execute karne ke steps
- Cardinality - Column/result mein distinct values ya matching row counts se related concept
- Selectivity - Condition kitne kam records select karti hai
- Index Overhead - Index maintain karne ka storage aur write cost

- shared hit means the required page was already in PostgreSQL's shared buffer cache.
- shared read means PostgreSQL had to read the page into that cache.

### What happens if you create too many indexes?

`Too few indexes	                  Too many indexes
Some reads become slow	            Writes become slower
More rows may need scanning	        More disk space is consumed
More CPU may be used for searches	  More maintenance and cache pressure
Filtering can become expensive	    Updates may require extra index work`

### Create a composite index

- This is called a composite index because it contains multiple columns.
- We can create an index that supports both the category filter and the requested ordering.
- WHERE category = 'Electronics' ORDER BY created_at DESC, id DESC

```
CREATE INDEX idx_products_category_created_id
ON products (
    category,
    created_at DESC,
    id DESC
);
```

Why this order?

- category comes first because we filter by it.
- created_at comes next because we sort by it.
- id comes last because it breaks ties in the sort order.

### Check the table and index sizes

```
SELECT
    pg_size_pretty(pg_relation_size('products')) AS table_size,
    pg_size_pretty(pg_indexes_size('products')) AS indexes_size,
    pg_size_pretty(pg_total_relation_size('products')) AS total_size;
```

### List the indexes on your table

```
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'products';
```

### Remove Index

DROP INDEX idx_products_category_created_id;

====================================================================================================

# Measure performance / Query Optimization - SQL query ka unnecessary database work kam karna

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
- EXPLAIN - PostgreSQL ka estimated query execution plan
- EXPLAIN ANALYZE - Query actually execute karke real measurements
- Query Cost - Planner ka estimated work; milliseconds nahi
- Execution Time - Actual query execution duration
- Slow Query - Expected requirement ke comparison mein expensive query
- ANALYZE products - Query planner ki table statistics refresh karna
- VACUUM - Dead row versions ki storage reuse ke liye cleanup
- Dead Tuples - Old/deleted row versions jo cleanup ke eligible ho sakte hain

Important: EXPLAIN ANALYZE actual query run karta hai. UPDATE/DELETE ke saath carefully use karna, preferably rollbackable transaction mein.

====================================================================================================

# Offset vs Cursor-Based Pagination (Keyset Pagination)

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

- Deep Pagination — Jab user bahut aage ka page request kare aur database ko bahut saare records skip karne padein.

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

====================================================================================================

# Transactions - Multiple SQL operations ko ek logical unit mein execute karna

```
BEGIN;

UPDATE products
SET stock = stock - 1
WHERE id = 'PRODUCT_UUID';

INSERT INTO orders (...);

COMMIT;
```

- BEGIN - Transaction start
- COMMIT - Changes permanent karna
- ROLLBACK - Uncommitted changes undo karna
- Atomic Operation - Ek indivisible operation ke roop mein execute hona
- Autocommit - Explicit transaction na ho toh individual statements apni transaction mein run hoti hain
- Database Constraint - Database-level validation rule
- Transaction Boundary - Transaction kahan start aur end hoti hai

### ACID

- Atomicity - Saare related operations commit hon ya rollback
- Consistency - Defined database constraints/invariants valid rahen
- Isolation - Concurrent transactions ke interaction aur visibility rules
- Durability - Committed changes database failure/restart ke baad survive karein, durability settings ke according

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

### Fix it using an atomic conditional UPDATE

```
UPDATE products
SET stock = stock - 1
WHERE id = 'YOUR_PRODUCT_UUID'
  AND stock >= 1
RETURNING id, price, stock;
```

### But why do we still need a transaction?

- Imagine the first operation succeeds, but the second fails due to a database constraint or another error.
- Without a transaction, inventory remains deducted even though no order exists.

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

====================================================================================================

### Transaction Isolation Levels

PostgreSQL supports these four SQL isolation levels:

- Read Uncommitted - Behaves like Read Committed
- READ COMMITTED — Each statement sees a fresh committed snapshot (Har query ka latest committed data)
- REPEATABLE READ — Transaction reads use a stable snapshot (Ek transaction mein same snapshot)
- SERIALIZABLE — Concurrent transactions must behave as though executed in some serial order, or one is rejected (Result aisa ho jaise transactions ek-ek karke chali hon)

- PostgreSQL's default is READ COMMITTED.

- Concurrent Transactions - Multiple transactions ka time overlap hona
- Dirty Read - Doosri transaction ka uncommitted data read karna
- Non-repeatable Read - Same transaction mein same row ko dobara read karne par different committed value milna
- Phantom Read - Same condition dobara run karne par matching rows ka set change ho jaana
- Write Skew - Transactions same condition check karke alag rows update kar dein aur combined rule toot jaaye
- Serialization Failure - PostgreSQL transaction reject kare kyunki safe serializable execution maintain nahi ho rahi
- MVCC - Multi-Version Concurrency Control — different row versions ki visibility manage karna
- Snapshot - Kisi statement/transaction ko visible database state

### READ COMMITTED

- Products list karna.
- Order create karna, jab stock safely conditional update se deduct ho.
- Normal CRUD operations.

### REPEATABLE READ

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

### SERIALIZABLE

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

- READ COMMITTED mein jab do transactions same row ko conditional UPDATE karti hain, toh PostgreSQL lock aur condition recheck ki wajah se safely handle kar sakta hai. Lekin jab business condition multiple rows par depend karti hai aur transactions alag rows update karti hain, toh sirf row locking enough nahi hoti.
- Bas ye difference samajh gaye, toh READ COMMITTED vs SERIALIZABLE ka main doubt clear ho jayega.

### READ COMMITTED vs SERIALIZABLE

- Do accounts mein total ₹1,000 hain. Minimum combined balance ₹500 chahiye.

- A aur B dono ₹400 withdraw karna chahte hain.

- READ COMMITTED: Dono pehle ₹1,000 read karke different accounts update kar sakte hain. Final ₹200 ho sakta hai.

- SERIALIZABLE: Aisi conflicting execution ko PostgreSQL serialization failure ke through reject karega, taaki committed result serial execution jaisa ho.

- Important: Dono levels mein transactions concurrently chal sakti hain. SERIALIZABLE ka matlab transactions ko literally ek-ek karke chalana nahi.

====================================================================================================

# Locking & Deadlocks

- Lock Contention - Multiple transactions ka same lock ke liye compete karna
- Lock Wait Lock- available hone ka wait karna
- lock_timeout - Lock acquire karne ke liye maximum wait

### Pessimistic Locking

- FOR UPDATE PostgreSQL ko bolta hai: Is row ko meri transaction ke liye lock karo. Jab tak main COMMIT ya ROLLBACK nahi karta, conflicting transactions ko wait karna padega.

```
SELECT *
FROM products
WHERE id = 'PRODUCT_ID'
FOR UPDATE;
```

Kab use karte hain?

- Inventory reserve karte waqt, jab stock read karne ke baad multiple decisions lene hon.
- Wallet ya bank account ka balance modify karte waqt.

- Har update ke liye alag SELECT FOR UPDATE zaruri nahi hai. Hamara existing atomic conditional UPDATE already appropriate row locking karta hai.

### Deadlock kya hota hai?

- Ab soch Customer A ke paas Product 1 ka lock hai aur Customer B ke paas Product 2 ka lock hai.
- A ko Product 2 bhi chahiye.
- B ko Product 1 bhi chahiye.
- Dono ek-doosre ke lock ka wait kar rahe hain.

- PostgreSQL deadlock automatically detect karke ek transaction ko abort karta hai, taaki doosri continue kar sake.

```
CREATE TABLE IF NOT EXISTS deadlock_lab (
    id INTEGER PRIMARY KEY,
    stock INTEGER NOT NULL
);

INSERT INTO deadlock_lab (id, stock)
VALUES (1, 10), (2, 10)
ON CONFLICT (id)
DO UPDATE SET stock = EXCLUDED.stock;
```

- Terminal A — Product 1 lock karega

```
BEGIN;

UPDATE deadlock_lab
SET stock = stock - 1
WHERE id = 1;
```

- Terminal B — Product 2 lock karega

```
BEGIN;

UPDATE deadlock_lab
SET stock = stock - 1
WHERE id = 2;
```

- Terminal A — Ab Product 2 bhi chahiye

```
UPDATE deadlock_lab
SET stock = stock - 1
WHERE id = 2;
```

- Terminal B — Ab Product 1 bhi chahiye

```
UPDATE deadlock_lab
SET stock = stock - 1
WHERE id = 1;
```

- PostgreSQL ko deadlock detect hoga aur dono mein se kisi ek transaction ko error milega: ERROR: deadlock detected SQLSTATE: 40P01

- Production mein aur bhi precautions useful hote hain: transactions short rakho, unnecessary database work avoid karo, aur 40P01 deadlock errors ke liye bounded retry logic rakho.

- Deadlock - Circular lock waiting
- Deadlock Victim - Jis transaction ko PostgreSQL abort karta hai
- 40P01 - PostgreSQL deadlock error code
- Lock Ordering - Multiple rows ko consistent order mein lock karna
- Retry - Failed transaction ko dobara execute karna
- Backoff - Retry se pehle delay rakhna
- Starvation - Kisi operation ko repeatedly resource access na milna

### Optimistic Locking / Versioning

- Main pehle lock hold nahi karunga. Update karte waqt check karunga ki kisi aur ne data change toh nahi kiya.

- Iske liye hum aksar version column use karte hain.

- Customer A aur Customer B dono ne version 1 read kiya.
- A ne update kiya: stock 9, version 2.
- B bhi version 1 ke basis par update karne aaya.
- Database ne dekha ki current version 2 hai.
- B ka update reject ho gaya.

```
ALTER TABLE isolation_lab
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE isolation_lab
SET stock = 10, version = 1
WHERE id = 1;
```

- Customer A update karta hai

```
UPDATE isolation_lab
SET stock = 9,
    version = version + 1
WHERE id = 1
  AND version = 1
RETURNING stock, version;
```

- Customer B purane version se update karta hai

```
UPDATE isolation_lab
SET stock = 8,
    version = version + 1
WHERE id = 1
  AND version = 1
RETURNING stock, version;
```

- Kyunki version ab 1 nahi, 2 hai.
- B ko latest data dobara read karke apna decision repeat karna hoga.

- Important: Optimistic locking bhi internally UPDATE ke time PostgreSQL row locks use karti hai. Difference ye hai ki hum pehle se application-level read lock hold nahi kar rahe; hum version compare karke stale updates detect kar rahe hain.

- Optimistic locking mein conflicts hone par request fail ho sakti hai. Agar 100 admins constantly same product update kar rahe hain, toh kaafi requests ko version conflict milega. Aisi situation mein pessimistic locking ya different workflow better ho sakta hai.

- Version Column - Data change hone par increment hone wala number
- Optimistic Concurrency Control (OCC) - Version compare karke conflicting writes detect karna
- Lost Update - Purani read par based update naye change ko overwrite kar de
- Stale Data - Client ke paas outdated data
- Compare-and-Swap (CAS) - Expected current value/version match ho tabhi change apply karna
- 409 Conflict - Client ka requested update current state se conflict karta hai

====================================================================================================
