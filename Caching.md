====================================================================================================

# Redis

- Cache - Frequently used data ki temporary copy
- Cache Hit - Data Redis mein mil gaya
- Cache Miss - Data Redis mein nahi mila
- TTL - Time To Live — cache entry kitni der valid rahegi
- Cache Key - Redis mein data ka unique identifier
- Cache-Aside - First cache check, on miss database read
- Stale Data - Cache mein outdated value
- Cache Invalidation - Outdated cache entry remove/update karna

```
TTL                 value Meaning
Positive number     Seconds remaining
0                   Key already absent thi
-1	                Key exists, expiration configured nahi
-2	                Key exist nahi karti
```

- FLUSHALL mat use karna, kyunki woh Redis instance ke saare databases se keys remove kar sakta hai, sirf CommerceFlow ki nahi.

====================================================================================================

# Ab ek real problem: Stale Cache

Maan lo:

1. Product price PostgreSQL mein ₹50,000 hai.
2. Redis mein bhi ₹50,000 cache ho gaya.
3. Admin ne Product PATCH API se price ₹45,000 kar diya.
4. Redis mein purana data abhi bhi stored hai.
5. Customer ko ₹50,000 dikh sakta hai.

Ye stale cache problem hai.

- Humne abhi only TTL use kiya hai. Isliye cache maximum configured expiry duration tak stale reh sakta hai, aur concurrent requests ke time aur bhi consistency issues possible hain.

Iska solution kya hai?
Cache Invalidation.

Product update successful hone par corresponding Redis key delete karenge: await redis.del(`commerceflow:product:${productId}`);

====================================================================================================

# Sabse pehle 3 caching strategies samjho

```
Strategy	            Kya hota hai?	                                Trade-off
TTL Only	            Entry expiry hone tak cached rehti hai	        Stale data mil sakta hai
Invalidate on Write	    DB update ke baad cache key delete	            Next read ko DB hit karna padega
Write-Through	        Write path DB aur cache dono update karta hai	Coordination aur consistency complex hoti hai
```

- Ye commonly used approach hai: successful database write ke baad cache delete karo, taaki next read fresh data load kare.

====================================================================================================

# Cache Invalidation Race Condition

- Request A — GET
- Cache miss hoti hai. PostgreSQL se old product read karta hai, lekin Redis SET abhi pending hai.

- Request B — PATCH
- PostgreSQL mein new price commit hoti hai, aur Redis DEL execute hota hai.

- Request A — continues
- Purane product ko Redis mein SET kar deta hai.

- Result
- Redis mein phir stale product aa gaya, even though PATCH ke baad DEL hua tha.

Production mein solutions kya ho sakte hain?

- Versioned cache entries/keys.
- Coordinated cache population and invalidation.
- Change events with reliable delivery.
- Short TTL as an additional safety limit.
- Strong consistency required ho toh authoritative database read.

- Cache Invalidation - Old cached data remove karna
- Stale Cache - Outdated cached value
- Cache-Aside - Cache miss par DB se value load karna
- Invalidate on Write - DB write success ke baad cached key delete
- TTL - Cache entry ka expiry time
- Cache Consistency - Cache aur original data ke beech correctness
- Race Condition - Concurrent operation timing se different result
- Source of Truth - Authoritative data store, humare case mein PostgreSQL
- Idempotent Delete - Already missing cache key ko dobara delete karna harmless hai
- Write-Through - Write path mein cache update bhi karna
- Eventual Consistency - Copies kuch delay ke baad consistent ho sakti hain

====================================================================================================

# Cache Stampede / Thundering Herd

- Maan lo CommerceFlow par ek popular iPhone ka product page hai.
- Redis mein product cached hai, TTL 30 seconds.
- Ab exactly 30 seconds baad cache expire ho gayi.
- Usi time 100 customers product GET API hit kar dete hain.
- Har request ko Redis se null milta hai, toh sab PostgreSQL query chala deti hain.
- Isko Cache Stampede ya Thundering Herd Problem kehte hain.

- Cache Stampede - Same cache miss par bahut saari DB queries
- Thundering Herd - Multiple operations ek hi resource par simultaneously rush karna
- Single-Flight - Same pending work ko ek Promise mein combine karna
- Distributed Lock - Multiple processes ke beech coordination
- Lock Owner - Jis request ne lock acquire ki
- Lock TTL / Lease - Lock ki expiry duration
- Polling - Repeated intervals par result check karna
- Fallback - Primary mechanism fail ho toh alternate path
- Lock Contention - Multiple processes same lock acquire karna chahte hain
- Fencing Token - Stale lock owner ke writes reject karne ke liye monotonic ownership/version mechanism

### Solution 1 — Single-Flight

- Ek process mein same data ke liye agar ek request already database fetch kar rahi hai, toh baaki requests nayi query start karne ke bajaye usi pending Promise ka wait karein.

### Solution 2 — Redis Lock

- Ab maan lo Cluster mein 4 Node.js processes hain.
- Har process ki apni pendingRequests Map hai.
- Toh Single-Flight ke bawajood 4 SQL queries ho sakti hain.
- Isliye hum Redis Lock use karenge.
- Redis shared hai. Sab Node.js processes same lock key check kar sakte hain.
- Sirf lock acquire karne wala process database se cache fill karega.
- Baaki processes thodi der wait karke Redis mein newly cached result check karenge.

- Lock expiry kyu zaruri hai? Agar lock acquire karne wala process crash ho gaya, toh lock permanently stuck nahi rehna chahiye.

- Cache Hit → PostgreSQL query nahi.
- Cache Miss → PostgreSQL query ki zarurat pad sakti hai.
- Cache Stampede → Bahut saari requests ek saath miss karti hain.
- Single-Flight → Same process mein pending work share karo.
- Redis Lock → Different processes ke cache fills coordinate karo.

====================================================================================================

# Redis Rate Limiting

- Rate Limiting ka matlab: Ek particular client ko defined time window mein limited requests allow karna.

- Rate Limiting - Certain time mein requests limit karna
- Rate Limit Window - Jis duration mein requests count hongi
- Request Counter - Client ne kitni requests bheji
- HTTP 429 - Too Many Requests
- Retry-After - Client ko kitni der wait karna chahiye
- Throttling - Requests ki rate control karna
- Abuse Prevention - Excessive/automated requests se protection
- Distributed Rate Limiting - Multiple server instances ke beech shared limits

### Common algorithms

```
Algorithm       Simple meaning
Fixed Window    Ek fixed duration mein requests count karo
Sliding Window  Last N seconds ka rolling count
Token Bucket    Tokens refill hote hain; request token consume karti hai
Leaky Bucket    Requests ko controlled rate se process karna
```

- Redis Lua EVAL is check-and-update flow ko atomic banata hai.
- Atomic ka matlab: Redis script ke counter check aur update ke beech koi doosri command interleave nahi karegi.
- Agar 100 concurrent requests aati hain, toh Redis counter operations ko safely coordinate karega.
- Agar hum separate commands se pehle count read karein aur baad mein update karein, toh concurrent requests same old count dekhkar limit cross kar sakti hain.

```
Strategy	    Redis down hone par
Fail-Open	    Request allow; availability better, abuse risk higher
Fail-Closed	    Request reject; protection maintained, availability lower
```

- 429 - Too Many Requests
- Rate Limit Window - Counting duration
- Fixed Window Counter - Window ke andar request count
- Atomic Redis Script - Concurrent operations safely check/update
- Throttle - Traffic rate restrict karna
- Retry-After - Client ke retry ke liye wait duration
- Fail-Open - Dependency down toh request allow
- Fail-Closed - Dependency down toh request reject
- IP Spoofing - Fake IP identity claim karna
- Distributed Rate Limiting - Multiple processes ke liye shared limit
- Sliding Window - Rolling time range ka request count
- Token Bucket - Capacity aur refill rate se traffic control

### Production mein 4 important problems

- Problem A — IP spoofing through proxy headers
- Problem B — Fixed Window ka boundary effect
- Problem C — IP-based limiting sab users ke liye fair nahi
- Problem D — Rate Limiting aur Concurrency Limiting different hain

### Problem A — IP spoofing through proxy headers

- Express mein req.ip ka result reverse-proxy configuration se affected hota hai.
- Abhi local development mein default trust proxy = false rakhna theek hai.
- Agar production mein Nginx, load balancer ya Cloudflare use karenge, tab trusted proxy addresses configure karenge.
- Bina soche ye mat karna: app.set('trust proxy', true);
- Agar incoming forwarding headers trusted proxy se properly controlled nahi hain, toh attacker fake X-Forwarded-For bhejkar IP-based limits bypass kar sakta hai. Express ki documentation bhi proxy trust ko deployment topology ke hisaab se configure karne ko kehti hai.

### Problem B — Fixed Window ka boundary effect

- 5 requests last second of one window mein aur 5 requests next window ke beginning mein aa sakti hain.
- Matlab very short interval mein 10 requests allow ho sakti hain.
- Isi ko Fixed Window Boundary Problem kehte hain.
- Isko reduce karne ke liye Sliding Window ya Token Bucket useful hain.

### Problem C — IP-based limiting sab users ke liye fair nahi

- Ek office ke 100 customers same public IP share kar sakte hain.
- Agar IP limit 5 requests hai, toh kuch legitimate users unnecessarily block ho sakte hain.
- Isliye authenticated applications mein hum generally user ID / account ID / API key ke basis par limits bhi design karte hain.

### Problem D — Rate Limiting aur Concurrency Limiting different hain

- Maan lo 5 requests per 30 seconds allowed hain, lekin har request 2 minutes tak heavy processing karti hai.

- Rate Limiting alone ensure nahi karti ki simultaneous CPU load safe rahega.
  - Rate Limiting: Time window mein kitni requests.
  - Concurrency Limiting: Ek saath kitne operations running.

- Hum Worker Pool mein concurrency limiting already seekh chuke hain.

====================================================================================================

====================================================================================================
