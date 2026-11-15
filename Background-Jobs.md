====================================================================================================

# Background Jobs — BullMQ + Redis

- Queue - Pending tasks ko manage karne wala system
- Job - Ek specific task, jaise confirmation email
- Producer - Queue mein job add karne wala component
- Worker - Queue se job lekar process karne wala component
- Concurrency - Ek worker ek saath kitne jobs process kare
- Retry - Failed job dobara attempt karna
- Backoff - Failed attempt ke baad wait interval
- Stalled Job - Worker task process kar raha tha, lekin uski lock renew nahi hui

- Worker Thread Node.js ke andar alag JavaScript thread hai, jo CPU-heavy calculations ke liye useful hai.
- BullMQ Worker queue consumer hai. Woh alag Node.js process mein run ho sakta hai aur jobs process karta hai. Ye automatically Worker Thread nahi hota.

### BullMQ kya hai?

- BullMQ Node.js ke liye Redis-backed job queue library hai.
- Ismein hum jobs add, process, retry, delay aur monitor kar sakte hain.

### Job states

- waiting - Job queue mein hai, Worker ka wait
- active - Worker job process kar raha hai
- completed - Processor successfully finish hua
- failed - Job failed aur retry capacity exhausted ya failure terminal
- delayed - Scheduled time/backoff ka wait
- waiting-children - Child jobs complete hone ka wait, advanced flows mein

### Redis queue production mein kaise configure hogi?

- Redis persistence - Redis crash/restart par queued data lose ho sakta hai
- Memory eviction - Queue-related keys delete hone se failures ho sakte hain
- Worker monitoring - Failed jobs unnoticed reh sakti hain
- Queue retention - Redis memory unnecessarily grow kar sakti hai
- Graceful shutdown - Active jobs stall/reprocess ho sakti hain
- Retry policy - Permanent error endlessly repeat ho sakta hai
- Idempotent processing - Duplicate side effects ho sakte hain

====================================================================================================

# Retry, Exponential Backoff, Jitter & Dead-Letter Queue

- Ab imagine karo CommerceFlow customer ko order confirmation email bhej raha hai, lekin email provider temporarily down ho gaya.
- Kya humein job permanently fail kar deni chahiye? Ya immediately 100 baar retry karna chahiye?
- Dono approaches problematic ho sakti hain.

### Sabse pehle failures ko classify karo

```
Error	                                        Type	                        Retry?
Email provider temporarily unavailable (503)	Transient	                    Yes
Network timeout	                                Transient / uncertain outcome	Carefully, with idempotency
Provider rate limit (429)	                    Transient	                    After appropriate wait
Invalid email address	                        Permanent	                    No
Authentication credentials invalid	            Usually configuration error	    Don't blindly retry
Invalid job payload	                            Permanent	                    No
```

- Important distinction: Ek API call timeout hui, iska matlab ye nahi ki external operation fail hua. Ho sakta hai email send ho gayi ho, bas response lost hua.
- Isliye retries ke saath idempotency bhi important hai.

### Exponential Backoff kya hota hai?

- Maan lo first attempt fail hui.
- Agar hum instantly retry karte rahein
- Toh already overloaded service par aur load badhega.
- Isliye Exponential Backoff use karte hain.

### Jitter kya hota hai?

- Ab maan lo 10,000 jobs ek saath fail hui.
- Sab exponential backoff follow kar rahi hain.
- Agar sab exactly 1 second baad retry karti hain, toh dobara 10,000 requests provider ko hit kar sakti hain.
- Isko Retry Storm ya synchronized retry problem kehte hain.
- Jitter retry delays mein randomness introduce karta hai taaki sab workers same time retry na karein.
- BullMQ supports exponential backoff and a jitter option between 0 and 1. For jitter: 0.5, the delay is randomized between 50% and 100% of the calculated backoff.

### Dead-Letter Queue kya hoti hai?

- Maan lo notification job maximum 3 attempts ke baad bhi fail ho gayi.
- Ab usko permanently ignore karna dangerous hai.
- Hum use Dead-Letter Queue (DLQ) mein rakh sakte hain.

- DLQ ka purpose:
- Failed jobs preserve karna.
- Error reason inspect karna.
- Alerts raise karna.
- Issue fix hone ke baad controlled recovery karna.

====================================================================================================

# Transactional Outbox Pattern & Eventual Consistency

- Problem: PostgreSQL mein order confirm ho gaya, lekin Redis queue mein confirmation email job add nahi hui. Ab kya?

### Dual Write Problem kya hoti hai?

- Lekin agar PostgreSQL COMMIT aur Redis Queue.add() ke beech Node.js process crash ho jaaye?

```
await client.query('BEGIN');

// Update order status and inventory.
await confirmOrder(client, orderId);

await client.query('COMMIT');

// Add a notification job.
await notificationQueue.add('order-confirmation', {
  orderId,
});
```

- Ab reverse problem: Redis mein job add ho gayi, lekin PostgreSQL transaction rollback ho gayi.

```
await notificationQueue.add('order-confirmation', { orderId });

await client.query('COMMIT');
```

### Transactional Outbox kya hai?

- Transactional Outbox mein hum business data ke saath event record bhi same PostgreSQL transaction mein save karte hain.
- Direct Redis call transaction ke andar nahi karte.

- Transactional Outbox Flow

```
PostgreSQL Transaction
1. Confirm order
2. Deduct reserved stock
3. Insert outbox event
COMMIT together
↓
Outbox Publisher
Finds unpublished events
↓
Redis / BullMQ
↓
Notification Worker
```

- Dual Write - Ek operation mein do independent systems update karna
- Transactional Outbox - Business change aur event ek DB transaction mein save karna
- Outbox Table - Publish hone wale events ka durable record
- Publisher / Relay - Outbox se event read karke queue ko bhejna
- Eventual Consistency - Related systems kuch delay ke baad consistent hona
- At-Least-Once Delivery - Event ek se zyada baar publish/process ho sakta hai
- Idempotent Consumer - Duplicate event par duplicate business effect prevent karna

### PostgreSQL Outbox Table

- Outbox table mein event ka record PostgreSQL mein durable rahega, jab tak hum usse remove na karein.

- PENDING ka matlab queue mein publish hona baaki hai.

- PROCESSING ka matlab kisi publisher ne event claim kiya hai.

- PUBLISHED ka matlab publisher ne queue add operation successful observe kiya hai. Iska matlab email successfully send ho gayi, ye nahi.

# Outbox Publisher ka kaam

- Ab publisher PostgreSQL se unpublished events read karega aur Redis queue mein jobs add karega.

- Lekin ek question: Agar 3 publisher processes run kar rahe hain, toh kya teeno same event publish karenge?
- Isko reduce karne ke liye PostgreSQL mein: FOR UPDATE SKIP LOCKED
- SKIP LOCKED locked rows ko wait karne ke bajaye skip karta hai, jo queue-like tables ke multiple consumers ke liye useful hota hai.

- Agar process publish se pehle crash ho, toh lease expire hone par event recover ho sakta hai.
- Is approach mein PostgreSQL lock ko Redis network operation ke dauran hold nahi karenge.

### Publisher ke important concepts

- SKIP LOCKED - Agar multiple publishers ek saath events claim karte hain, toh same PostgreSQL row par unnecessarily wait karne ke bajaye doosre eligible events claim kar sakte hain.

- Lease - Publisher event claim karta hai aur uske paas temporary ownership hoti hai. Agar publisher crash ho gaya, toh lease expire hone par event eligible ho jaata hai.

- Deterministic Job ID - Same event dobara publish karne ki koshish hui toh BullMQ existing job ID recognize kar sakta hai. BullMQ documentation confirm karti hai ki custom job IDs duplicates reduce kar sakti hain, lekin existing job remove ho jaaye toh same ID dobara add ho sakti hai.

- Network operations ke dauran DB transaction open nahi - Publisher ka claimEvent() PostgreSQL statement complete karta hai. Uske baad Redis call hoti hai. Isse long network waits ke dauran PostgreSQL row locks hold karna avoid hota hai.

### Kya Transactional Outbox exactly-once guarantee karta hai?

Nahi. Ye ek important interview aur production concept hai.

Maan lo:

1. Publisher ne event BullMQ mein successfully add kar diya.
2. PostgreSQL mein PUBLISHED update se pehle publisher crash ho gaya.
3. PostgreSQL event abhi PROCESSING hai.
4. Lease expire ho gayi.
5. Publisher restart hua aur same event dobara enqueue karne ki koshish karta hai.

### Production mein aur kya improve karenge?

- Publisher crash - Expired leases se recovery
- Redis timeout - Retry with controlled backoff
- Bad event payload - Attempt limit + DLQ/alert
- Multiple publishers - SKIP LOCKED + leases
- Duplicate publishing - Idempotent consumer
- Long publish operation - Lease renewal or safe ownership handling
- Queue data loss - Redis persistence, monitoring and reconciliation
- Huge outbox table - Retention/archival strategy
- Delayed notifications - Queue age and outbox lag metrics
- Out-of-order events - Aggregate versions or per-aggregate ordering

- Dual Write Problem - Two systems ke writes atomic nahi
- Transactional Outbox - DB business change + event one transaction
- Outbox Publisher - Pending events queue mein bhejna
- Eventual Consistency - Systems mein update timing temporarily different
- At-Least-Once - Same event repeat ho sakta hai
- Idempotent Consumer - Duplicate message ka repeated effect prevent
- Lease - Publisher ki temporary ownership
- SKIP LOCKED - Already locked rows skip karna
- Reconciliation - Missing/inconsistent events recover karna
- Outbox Lag - Event commit aur publish ke beech delay

====================================================================================================

====================================================================================================
