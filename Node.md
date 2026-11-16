====================================================================================================

# Event Loop Blocking

- Maan lo humare backend mein ek endpoint hai: GET /api/v1/performance/blocking
- Ye endpoint 5 seconds tak continuous calculation karta hai.
- Ab agar koi customer isi time: GET /api/v1/health
- call kare, toh health API bhi wait kar sakti hai.
- Kyunki heavy calculation main JavaScript thread ko busy rakhti hai. Jab tak woh complete nahi hoti, Event Loop doosre route handlers execute nahi kar pata.

- Node.js documentation bhi explain karti hai ki expensive work se Event Loop block hone par baaki clients ki latency aur throughput affect ho sakti hai.

- Event Loop - Ready asynchronous callbacks ko execute karne ka mechanism
- Main Thread - Node.js ka primary JavaScript execution thread
- Blocking - Main thread ko busy rakhna, jisse doosra JS work delay ho
- Synchronous - Function complete hone tak current JS execution aage na badhe
- Asynchronous - I/O ya timer ka wait karte waqt doosra work execute ho sake
- CPU-bound - CPU calculation bottleneck ho
- I/O-bound - Database, network, disk ka wait bottleneck ho
- Event Loop Lag - Callback ready hone aur execute hone ke beech ka extra delay
- Latency - Request complete hone mein laga time
- Throughput - Fixed time mein handle ki gayi requests

- await ka matlab ye nahi hai: Is function ko background mein execute karo.
- await ka matlab hai: Is expression ka result lo. Agar Promise pending hai toh current async function ko pause karo aur Promise settle hone par resume karo.

### Event Loop Lag

- Event Loop blocking sirf HTTP requests ko affect nahi karti. Timers bhi delay ho sakte hain.

```
// Demonstrates how synchronous work delays timer callbacks.
router.get('/timer-delay', (req, res) => {
  const start = performance.now();

  // This callback should become eligible after about 100 ms.
  setTimeout(() => {
    console.log(
      'Timer callback ran after:',
      Math.round(performance.now() - start),
      'ms'
    );
  }, 100);

  // Blocks the thread for about 5 seconds.
  heavyCalculation();

  res.json({
    success: true,
    message: 'Check the Node.js terminal for timer delay',
  });
});
```

- Timer 100 ms ka tha. Phir 5,000 ms baad kyu execute hua?
- Kyunki timer ready hone ke bawajood main thread busy tha.

====================================================================================================

# Worker Thread

- Worker Thread - Separate JavaScript execution thread
- Main Thread - Express request handlers chalane wala primary JS thread
- Offloading - Heavy task ko doosre thread par bhejna
- Message Passing - Main aur Worker ke beech data exchange
- Parallelism - Multiple CPU tasks ko parallel execute karna
- Concurrency Limit - Ek time par kitne jobs allow hain
- Worker Pool - Reusable workers ka group
- Worker Startup Overhead - New Worker banane mein lagne wala time/resources
- Task / Job - Worker ko diya gaya calculation ka kaam
- Task Queue - Pending jobs ki waiting list
- Queue Limit - Maximum kitni jobs wait kar sakti hain
- Backpressure - Capacity full hone par aur kaam accept na karna
- Worker Reuse - Same Worker par multiple tasks execute karna

- Ek important learning: Worker Thread ka purpose heavy calculation ko hamesha faster banana nahi hai. Uska main benefit hai main Event Loop ko responsive rakhna.

====================================================================================================

# Clustering

- Cluster - Multiple Node.js server processes
- Primary Process - Worker processes manage karta hai
- Worker Process - Actual Express HTTP requests handle karta hai
- Fork - Naya child process create karna
- PID - Process ID
- IPC - Inter-Process Communication, processes ke beech communication
- Load Distribution - Requests/connections ko multiple workers mein distribute karna
- Horizontal Scaling - More application instances add karna
- Vertical Scaling - Same machine mein CPU/RAM resources badhana
- Process Isolation - Har process ki separate memory
- Crash Recovery - Failed worker ko replace karna
- Crash Loop - Worker repeatedly crash aur restart hona
- cluster.setupPrimary() - Worker ko kaunsi file execute karni hai
- npm run start:cluster

====================================================================================================

# Streams

Node.js mein 4 important types hote hain:

- Readable - Data read karta hai - fs.createReadStream()
- Writable - Data write karta hai - fs.createWriteStream()
- Duplex - Read aur write dono - TCP socket
- Transform - Input data ko modify karke output deta hai - gzip compression

- Gzip compression mein repeated data patterns ko efficiently encode kiya jaata hai.

Gzip compression levels generally 0 se 9 tak hote hain.

- 0 — Compression effectively disabled.
- 1 — Faster compression, generally larger output.
- 6 — Balanced default-style compression level.
- 9 — More compression effort, generally more CPU work.

- Original -> Gzip (Transform) -> CSV.GZ (Compressed)

- Stream - Data ko progressively process karna
- Chunk - Data ka chhota part
- Pipe - Readable ko Writable se connect karna
- Pipeline - Streams ko error handling aur cleanup ke saath connect karna
- Buffer - Temporary data storage in memory
- Backpressure - Slow consumer ke according producer ki speed control karna
- High Water Mark - Buffer threshold jahan backpressure signal diya ja sakta hai
- Drain Event - Writable ka buffer enough empty ho gaya, writes resume kar sakte hain
- Async Generator - async function\*, jo values gradually produce karta hai
- Memory Footprint - Kisi operation ki memory requirement
- Precompression - File ko pehle se compress karke rakhna

# Backpressure

Imagine karo:

- File Readable Stream bahut fast data read kar rahi hai.
- Client ka network slow hai.
- HTTP response utni speed se data send nahi kar pa raha.
  Agar hum continuously data produce karte rahein, toh memory mein unsent data collect hone lagega.

- Is problem ko handle karne ke mechanism ko Backpressure kehte hain.

- Simple meaning:"Consumer slow hai, toh producer ko bhi slow hona padega."

### Node.js memory kaise measure hoti hai?

- process.memoryUsage();
- Numbers bytes mein hote hain.

{
"rss": 78553088,
"heapTotal": 12648448,
"heapUsed": 9214720,
"external": 6234982,
"arrayBuffers": 5128340
}

- Memory Profiling - Application ki memory usage measure karna
- RSS - Process ki physical memory usage ka measure
- Heap - JavaScript objects ke liye V8-managed memory
- heapUsed - Currently used JS heap memory
- heapTotal - Allocated JS heap space
- external - JS heap ke bahar associated native memory
- arrayBuffers - ArrayBuffers aur Node.js Buffers ki memory
- GC (Garbage Collection) - Unused objects ki memory reclaim karne ka mechanism

- Buffer ka data generally V8 heap ke bahar allocate hota hai. Isliye bade CSV Buffer ko measure karte waqt sirf heapUsed dekhna misleading ho sakta hai. external, arrayBuffers aur rss bhi dekhenge

====================================================================================================

# Memory Leaks & Garbage Collection

- JavaScript ke V8 engine mein Garbage Collector hota hai.
- Function complete hone ke baad products array ko koi reference retain nahi kar raha. Garbage Collector future mein uski memory reclaim kar sakta hai.

```
function generateReport() {
  const products = [
    { name: 'Laptop' },
    { name: 'Mobile' },
  ];

  return products.length;
}

generateReport();
```

- Ab allReports array un objects ko reference kar raha hai.
- Isliye GC un objects ko unused nahi maan sakta.

```
const allReports = [];

function generateReport() {
  const products = [
    { name: 'Laptop' },
    { name: 'Mobile' },
  ];

  // Keeping a reference prevents these objects
  // from becoming eligible for garbage collection.
  allReports.push(products);
}
```

### Common memory leak causes

```
Cause	            Problem	                                                    Fix
Global arrays	    Objects indefinitely retain hote hain	                      Bounded storage, eviction
Unbounded cache	  Cache entries continuously grow karti hain	                TTL + max-size
Event listeners	  Duplicate listeners accumulate hote hain	                  Register once / cleanup
Timers	          Intervals resources aur references retain kar sakte hain	  clearInterval()
Closures	        Large objects references ke through alive reh sakte hain	  Unnecessary references release
Pending tasks	    Queue unlimited grow karti hai	                            Backpressure, queue limits
Buffers	          Native memory pressure	                                    Streaming, bounded buffers
```

====================================================================================================

# Heap Snapshots & Memory Profiling

Lekin ab questions hain:

- Ye 95 MB kisne consume ki?
- Kaunsa array itne objects hold kar raha hai?
- Garbage Collector unhe delete kyu nahi kar raha?
- Exact problem kis code mein hai?

- Heap Snapshot in questions ke answers dhoondhne mein help karta hai.
- Heap Snapshot ek particular moment par JavaScript heap mein reachable objects aur unke references ka snapshot hota hai.

- Heap Snapshot - Memory mein reachable JS objects ka snapshot
- Heap Profiling - Memory allocations aur retained objects investigate karna
- Shallow Size - Object khud kitni memory occupy karta hai
- Retained Size - Object remove hone par potentially kitni memory free ho sakti hai
- Retainers Kaunse - references object ko alive rakhe hue hain
- Retaining Path - Object se GC root tak reference chain
- GC Root - Jahan se garbage collector reachability trace karta hai
- Comparison View - Do snapshots ke object counts/sizes ka difference
- Detached Object - Context se separate hua object jo kisi reference ki wajah se retained hai

- Inspector ek debugging interface hai jisse Chrome DevTools Node.js process se connect ho sakta hai.

Chrome DevTools ko Node.js se connect karo:

- Chrome ke address bar mein chrome://inspect open karo.
- Nayi DevTools window mein Memory tab select karo

====================================================================================================

# Graceful Shutdown

- Graceful Shutdown - Running work ko safely complete karke server stop karna
- Abrupt Shutdown - Process ko immediately stop kar dena
- SIGINT - Interrupt signal, usually terminal mein Ctrl+C
- SIGTERM - Process ko terminate karne ki request
- In-flight Request - Request jo currently process ho rahi hai
- Connection Draining - Active connections/requests ko complete hone dena
- Resource Cleanup - DB connections, timers, workers etc. close karna
- Shutdown Timeout - Shutdown ke liye maximum allowed time
- Force Kill - Deadline ke baad process ko forcibly stop karna

====================================================================================================

# Child Processes

- Child Process ek separate operating-system process hota hai, jo main Node.js process se independently execute hota hai.

```
Method	    Kya karta hai?	                                  Kab use karein?
spawn()	    New process start, output streams mein deta hai	  Large/streaming output, long-running commands
exec()	    Shell command run, output buffer karta hai	      Small, trusted shell commands
execFile()	Executable directly run, output buffer karta hai	Small output, shell features unnecessary
fork()	    New Node.js process with IPC channel	            Separate Node.js script ke saath message exchange
```

- Important: exec() mein untrusted user input se shell command banana dangerous hai. Shell injection ho sakta hai. spawn() / execFile() mein shell: false aur explicit argument arrays safer default hain.

====================================================================================================

# Interview aur real project ke liye simple rule

Teen questions poochho:

1. Kaam JavaScript CPU calculation hai? → Worker Thread.
2. External program execute karna hai? → Child Process.
3. Sirf DB ya API response ka wait hai? → Normal async/await.
   Aur ek fourth question:

Kaam HTTP response ke immediately pehle complete hona zaruri hai? Agar nahi, toh background job queue consider karo.

- Case A — Tumne JavaScript function banaya
- Ab is calculation ko main thread se alag chalana hai.
- Choose: Worker Thread.

```
function calculateReport() {
  let total = 0;

  for (let i = 0; i < 1_000_000_000; i++) {
    total += Math.sqrt(i);
  }

  return total;
}
```

- Case B — Tum terminal mein koi command chalate ho
- Maan lo video compress karne ke liye terminal mein ye command chalti hai:
- ffmpeg -i input.mp4 output.mp4
- Ab tumhe ye command apni Express API se execute karni hai.
- Choose: Child Process.
- Kyun? ffmpeg ek alag executable program hai. Usko start karne ke liye Child Process use hota hai.

====================================================================================================

# API Response Compression, Pagination & Performance Measurement

Aaj hum teen cheezein karenge:

1. Response Compression: API se bheje jaane wale JSON ka size reduce karna.
2. Pagination Revision: Ek baar mein kitna data bhejna chahiye.
3. Performance Measurement: API slow hai toh actual bottleneck kaise identify karna.

### Response Compression

- Maan lo API ka JSON response 500 KB hai.
- Agar JSON mein repeated text hai, toh gzip usse kaafi chhota kar sakta hai.
- Rule: Compression network bandwidth reduce karti hai, lekin server par CPU cost add karti hai.

### Pagination Revision

- Maan lo Products API 10 lakh products return kar rahi hai.

Agar response gzip se compress bhi kar do, toh:

- PostgreSQL ko huge dataset fetch karna padega.
- Node.js ko large JSON process karna padega.
- Client ko huge response receive aur parse karna padega.
- Memory usage badh sakti hai.

- Isliye pagination pehle, compression uske baad useful optimization ho sakti hai.

### API Performance Measurement

- Ab ek situation socho
- Postman bolta hai: Response Time: 750 ms
- Tum kaise decide karoge ki problem PostgreSQL mein hai, Redis mein, Express processing mein, ya network mein?
- Isliye server-side timings collect karte hain.

### Average, P95 aur P99 latency kya hoti hai?

- Average - Sab response times ka mean
- Median / P50 - 50% requests is duration ya usse kam
- P95 - Approximately 95% requests is duration ya usse kam
- P99 - Approximately 99% requests is duration ya usse kam
- RPS - Requests Per Second
- Error Rate - Kitne percent requests fail hui

====================================================================================================

# Payments, Webhooks & Refunds

- Customer ne payment kar di, lekin backend ko payment success ka response nahi mila. Ab order confirm karna chahiye ya nahi?

### Payment Intent kya hota hai?

- Payment Intent ka simple meaning hai: Customer ek particular order ke liye payment karna chahta hai.

- Order created
  ↓
  Inventory reserved
  ↓
  Payment intent created
  ↓
  Customer attempts payment
  ↓
  Gateway processes transaction
  ↓
  Success / Failure / Pending

### Webhook kya hota hai?

- Webhook ek server-to-server HTTP notification hai.
- Jab payment gateway par koi important event hota hai, gateway tumhare backend endpoint ko request bhej sakta hai.

- Lekin webhooks ke saath 3 important problems aati hain:
- Duplicate delivery - Same event do baar aa sakta hai
- Out-of-order delivery - Later event pehle receive ho sakta hai
- Delivery failure - Gateway ki request timeout ho sakti hai

### Real webhook ki security kaise hoti hai?

- Agar koi attacker khud payment.succeeded request bhej de toh?
- Isliye production webhook endpoint ko sirf JSON receive karke payment successful mark nahi karna chahiye.
- Real payment gateway usually request ke saath cryptographic signature bhejta hai.
- Backend configured secret se verify karta hai ki request payload genuine hai aur alter nahi hua.
- Critical: Signature ko original raw HTTP bytes par verify karo, JSON.stringify(req.body) par nahi.
- Express mein raw webhook route ko JSON body-parser middleware se pehle mount karna padega, ya provider-compatible raw-body capture strategy use karni hogi.

- Aur signature pass ho jaana alone enough nahi:
- Correct gateway account aur environment verify karo.
- Payment ID, order ID, amount aur currency cross-check karo.
- Duplicate event IDs deduplicate karo.
- Conflicting ya out-of-order states safely handle karo.
- Real refund success ko gateway se verify karo.

### Reconciliation kya hai?

- Maan lo gateway ne payment success process kar di, lekin webhook CommerceFlow tak kabhi nahi pahunchi.
- Reconciliation ka matlab gateway se authoritative payment status check karke apne records ko safely correct karna.
- Real production systems mein scheduled reconciliation jobs useful hoti hain.

- Payment Intent - Order ke liye payment start karne ka intention/resource
- Payment Gateway - External payment-processing provider
- Webhook - Server-to-server event notification
- HMAC Signature - Secret se request authenticity/integrity verify karna
- Raw Body - Original HTTP request bytes
- Webhook Idempotency - Repeated event se duplicate effect prevent karna
- Event ID - Event ka unique identifier
- Out-of-Order Events - Events expected order se alag arrive hona
- Refund - Successful payment ka money return karna
- Reconciliation - External aur local payment state match karna
- At-Least-Once Delivery - Event multiple times deliver ho sakta hai
- Payment Attempt - Ek order ko pay karne ki particular attempt

====================================================================================================

# Authentication, JWT & Refresh Tokens

```
Authentication	                Authorization
Tum kaun ho?	                  Tum kya kar sakte ho?
Login credentials verify        karna	Permission check karna
JWT validate karna	            Admin/customer access decide karna
User identity establish karna	  Resource ownership enforce karna
```

### JWT kya hai?

- Ye signed token hota hai jise backend verify karke user identity aur kuch claims check kar sakta hai.

- JWT generally 3 parts mein hota hai:
- Header (Algorithm).Payload (Claims).Signature(Integrity)

- Example JWT payload:

```
{
  "sub": "user-uuid",
  "iss": "commerceflow-learning",
  "aud": "commerceflow-api",
  "iat": 1794740000,
  "exp": 1794740600
}
```

- sub - Subject — user identity
- iss - Issuer — token kisne issue kiya
- aud - Audience — token kis application/service ke liye hai
- iat - Issued at
- exp - Expiration time

====================================================================================================

# Authorization, RBAC & API Security

- RBAC = Role-Based Access Control.
- User ko role assign hota hai, aur role ke basis par actions allow hote hain.

- Maan lo Customer A aur Customer B ka role same CUSTOMER hai. Sirf role check karne se backend decide nahi kar paayega ki order kiska hai.

```
Model	  Permission kis basis par?	  Example
RBAC	  Role	                      Admin can view all orders
ABAC	  Attributes/context	        Refund allowed if amount within limit and order not shipped
ReBAC	  Relationships	              User belongs to organization that owns resource
```

- Least Privilege ka matlab user/service ko sirf utni permissions do jitni uske kaam ke liye necessary hain.
- Maan lo Customer Support employee ko orders dekhne hain, lekin refunds approve nahi karne.

- RBAC - Role-Based Access Control
- ABAC - Attribute-Based Access Control
- ReBAC - Relationship-Based Access Control
- BOLA/IDOR - Kisi aur ke resource par unauthorized access
- Privilege Escalation - Allowed permissions se zyada access gain karna
- Mass Assignment - Client-supplied fields ko unchecked model mein save karna
- Least Privilege - Minimum necessary permissions
- Deny by Default - Explicit permission nahi toh access reject
- 401 Unauthorized - Valid authentication absent
- 403 Forbidden - Identity valid, permission insufficient
- 404 Not Found - Resource absent ya intentionally hidden
- Principal - Verified identity requesting access

====================================================================================================

# Monitoring, Metrics & Observability

- Maan lo CommerceFlow live hai. Customer complaint karta hai: "Order place karne mein 8 seconds lag rahe hain."

- Ab tumhare paas 3 questions hain:

1. Problem kab start hui?
2. Kitne customers affected hain?
3. Slow kya hai—Node.js, PostgreSQL, Redis ya payment gateway?

- Yahin Observability ka role aata hai.
- Monitoring: System healthy hai ya nahi, ye dekhna.
- Observability: System unhealthy hai toh kyun, ye investigate karna.

- Monitoring bolti hai: Orders API response time increased to 3 seconds.
- Observability help karti hai:

```
Orders API = 3 seconds
  PostgreSQL query = 2.7 seconds
  Application logic = 0.2 seconds
  Other processing = 0.1 seconds
```

### Observability ke 3 pillars

1. Logs - Kya hua?

```
Logs se particular incident investigate karte hain.

{
  "level": "error",
  "requestId": "req-123",
  "message": "Database query timed out",
  "durationMs": 3012
}
```

2. Metrics - Kitna / kitni baar?

```
Metrics se trends aur alerts identify karte hain.

Total requests: 10000
Failed requests: 120
Average response time: 180ms
P95 response time: 850ms
```

3. Traces - Time kahan laga?

```
Trace ek request ke multiple operations ka timing relationship dikhati hai.

POST /orders       950ms
  Auth check        15ms
  Product query    120ms
  Inventory update 700ms
  Response          15ms
  Other work       100ms
```

- Actual distributed tracing ke liye OpenTelemetry jaisa standard use kar sakte hain.

### P50, P95 aur P99 kya hote hain?

- Maan lo 100 customers ki API request timing measure ki.

```
Metric	Simple meaning
P50	    Approximately 50% requests isse fast/equal
P95	    Approximately 95% requests isse fast/equal
P99	    Approximately 99% requests isse fast/equal
```

- Maan lo average API response time 200ms hai, lekin P99 = 5 seconds.
- Matlab kuch customers ko bahut slow experience ho raha hai, jo average alone se clearly visible nahi hoga.
- Production APIs mein P95/P99 monitor karna useful hai.

### Practical: CommerceFlow mein Request ID + Metrics

Implement karenge:

- Request ID
- Request duration logging
- Prometheus metrics
- Liveness aur readiness health checks
- Slow API simulation

- prom-client Node.js applications ke liye counters, gauges, histograms aur default process metrics expose kar sakta hai.

### Request ID kyu?

- Customer complaint kare: Tum logs mein abc-123 search karke relevant request find kar sakte ho.
- Important: Hum abhi server-generated Request ID use kar rahe hain. Client-supplied arbitrary ID par blindly trust nahi karenge.

### Prometheus Metrics implement karo

- Counter vs Histogram?
- Counter sirf increase hota hai. - GET /products called 100 times.
- Histogram observations ki distribution record karta hai.

```
40 requests under 50ms
35 requests under 100ms
20 requests under 500ms
5 requests above 500ms
```

- Prometheus histograms request latency distributions aur percentile calculations ke liye useful hain.

### Health Checks: Liveness vs Readiness

- Ab maan lo Node.js process running hai, lekin PostgreSQL down hai.
- Kya application healthy hai?
- Partially.

- Node.js server alive hai, lekin database-dependent APIs serve nahi kar paayega.
- Isliye do alag health checks useful hain.

- Liveness - Process alive hai?
- Readiness - Process required dependencies ke saath traffic serve kar sakta hai?

### Real production debugging example

```
Observation	                          Possible cause
API P95 suddenly 4 seconds	          Slow downstream operation
PostgreSQL pool waiting clients high	Connection exhaustion
Event loop delay high	                Node.js blocking work
Redis timeout errors increasing	      Cache dependency issue
BullMQ waiting jobs increasing	      Workers slow/down
Memory continuously increasing	      Potential memory leak
Failed payments increasing	          Payment provider or application issue
```

- Ye signals cause ka proof nahi hote, lekin investigation ko right direction dete hain.

### Alerts kab lagane chahiye?

- Har error par notification bhejna useful nahi.

```
Metric	                    Example alert condition
API 5xx error ratio	        5 minutes tak unusually high
API P95 latency	            Normal baseline se significantly high
PostgreSQL waiting clients	Continuously elevated
BullMQ queue age	          Oldest waiting job too old
Worker failures	            Repeated terminal failures
Memory utilization	        Sustained growth/high usage
```

- Production thresholds actual traffic, SLO aur baseline ke according configure karenge.
- Monitoring: Dashboard mein problem visible hai.
- Alerting: Problem serious hone par responsible person ko notify kiya jaata hai.

- Logs - Individual events ka record
- Metrics - Numerical measurements over time
- Tracing - Request ke steps aur timings
- Request ID - Request identify/correlate karne ka identifier
- Counter - Increasing count
- Gauge - Current value, jaise active connections
- Histogram - Latency distribution
- P95/P99 - Tail latency percentiles
- Liveness - Process responsive
- Readiness - Required work serve karne ke liye ready
- SLO - Service reliability/performance target
- Alert - Important threshold breach par notification
- High Cardinality - Excessively many unique metric label combinations

====================================================================================================

# Timeouts, Circuit Breaker & Resilience

- Agar koi external service slow ya down ho jaaye, toh apni Node.js API ko kaise protect karte hain.

- Timeout - Service zyada time le toh wait karna band karo
- Retry - Temporary error par operation dobara try karo
- Circuit Breaker - Service repeatedly fail ho rahi ho toh kuch time usse call hi mat karo

### Circuit Breaker ke 3 states

1. CLOSED — Normal state - External service ko requests jaati hain. Failure threshold cross hone par circuit OPEN hota hai.

- Repeated failures

2. OPEN — Protection state - External service ko call nahi karte. Immediately fallback/error return karte hain.

- Cooldown completed

3. HALF_OPEN — Recovery check - Limited trial request allow karte hain. Successful ho toh CLOSED, fail ho toh wapas OPEN.

### Fallback kya hota hai?

- Maan lo customer order details open karta hai.
- Shipping service down hai.
- Kya complete order page fail karna chahiye?
- Zaruri nahi.
- Hum aisa response de sakte hain:

```
{
  "orderId": "ORDER-123",
  "orderStatus": "CONFIRMED",
  "shipping": {
    "status": "UNKNOWN",
    "message": "Shipping updates temporarily unavailable"
  }
}
```

- Customer ko order details mil jaayengi, bas shipping information temporarily unavailable hai.
- Isko Graceful Degradation kehte hain.

### Timeout aur Retry ek saath use karne ka danger

Maan lo:

- Ek request ka timeout: 3 seconds
- Maximum attempts: 3
- Retries ke beech backoff bhi hai

- Agar teeno attempts timeout hoti hain, toh total operation 9 seconds se zyada chal sakta hai.
- Customer-facing API ke liye ye unacceptable ho sakta hai.
- Isliye production mein overall time budget bhi define karna chahiye.

### Retry aur Circuit Breaker mein difference

- Retry bolta hai: Ek baar aur try karte hain.
- Circuit Breaker bolta hai: Service repeatedly fail ho rahi hai. Ab kuch time try hi nahi karenge.

- Timeout - Maximum wait duration
- Retry - Failed request dobara attempt
- Exponential Backoff - Retry delays gradually increase
- Jitter - Retry delays mein randomness
- Circuit Breaker - Failing dependency ko temporarily stop calling
- CLOSED - Normal requests allowed
- OPEN - Provider requests blocked
- HALF_OPEN - Limited recovery probe
- Fallback - Primary operation unavailable ho toh safe alternative
- Graceful Degradation - Partial functionality continue
- Bulkhead - Resources isolate karke failures spread hone se rokna
- Resilience - Dependency failures ke bawajood service ko safely operate karna

====================================================================================================

# Heap Snapshots & Memory Profiling

- Problem: CommerceFlow server start hone par 100 MB RAM use karta hai. Kuch ghante baad 300 MB, phir 700 MB. Eventually server crash ho jaata hai.

- Ab question hai: Memory kahan ja rahi hai aur kaunsa code usko hold karke baitha hai?

### Memory Leak ko simple example se samjho

- Maan lo tum restaurant mein waiter ho.
- Har customer ka order paper par likhte ho.
- Order complete hone ke baad paper discard kar dena chahiye.
- Lekin tum saare completed orders ki slips apni pocket mein rakhte jaate ho.
- Eventually pocket bhar jaayegi.

- Node.js Memory Leak bhi kuch aisa hi hai.
- Application ko kuch data ki ab zarurat nahi, lekin code abhi bhi us data ka reference hold kar raha hai.
- Isliye Garbage Collector us memory ko free nahi kar paata.

### Garbage Collector kya karta hai?

- JavaScript mein manually free() call nahi karte.
- V8 Garbage Collector identify karta hai ki kaunse JavaScript objects ab reachable nahi hain.

### Normal memory growth vs Memory Leak

- Normal usage: Memory allocate hoti hai, GC ke baad kuch memory reclaim ho sakti hai. Trend relatively stable ho sakta hai.

- Possible memory leak: Comparable workload ke baad bhi retained memory continuously increase ho rahi hai.

- Ek single memory spike dekhkar leak declare nahi karte.

### Node.js ke important memory numbers

- Node.js mein: console.log(process.memoryUsage());
- Example output: (Ye values bytes mein hoti hain.)

```
{
  "rss": 125829120,
  "heapTotal": 62914560,
  "heapUsed": 41943040,
  "external": 5242880,
  "arrayBuffers": 2097152
}
```

```
Property	    Meaning
heapUsed	    V8 heap mein currently used memory
heapTotal	    V8 heap ki allocated capacity
rss	          Process ki resident RAM, including heap aur other areas
external	    V8 heap ke bahar managed native allocations
arrayBuffers	ArrayBuffers aur Node.js Buffers ka memory usage
```

- rss aur heapUsed same nahi hote. Kabhi RSS badh sakta hai jabki heapUsed stable ho.

### Practical experiment — Intentionally memory leak create karo

- Ek separate learning server banayenge, jo port 5055 par run hoga.
- File create karo: scripts/memory-demo.js

- Code mein actual bug kahan hai? leakedRequests.push(data);
- Kyun? leakedRequests global array hai.
- Request complete hone ke baad bhi usmein data ka reference stored hai.
- Garbage Collector unnecessary objects ko remove nahi kar sakta, kyunki global array unko reference kar raha hai.

### Server ko debugging mode mein start karo

- Project root mein terminal open karo: node --inspect=127.0.0.1:9229 --expose-gc scripts/memory-demo.js

- Do flags use kar rahe hain:
- --inspect: Chrome DevTools se Node.js process inspect karne ke liye.
- --expose-gc: Learning ke liye manually garbage collection request karne ke liye.

- Security: Inspector sirf local 127.0.0.1 par bind karo. Public internet par inspector expose karna dangerous hai.

### Experiment A — Initial memory

- GET http://127.0.0.1:5055/memory

```
{
  "heapUsedMB": 8.7,
  "heapTotalMB": 11.5,
  "rssMB": 60.2,
  "externalMB": 2.3,
  "retainedBatches": 0
}
```

### Experiment B — Leak create karo

- POST /leak ko 10–20 baar manually send karo.
- Then: GET /memory

- Expected:
- retainedBatches increase hoga.
- heapUsedMB generally increase hogi.
- Manual GC ke baad bhi retained objects remain karenge.

### Experiment C — Fixed implementation

- POST /reset call karo.
- Uske baad POST /fixed ko 10–20 baar send karo.
- Then GET /memory.

- Expected:
- retainedBatches zero rahega.
- Temporary objects GC ke liye eligible honge.
- Memory exactly original number par return hona guaranteed nahi, lekin continuously retained growth nahi honi chahiye.

### Heap Snapshot kya hota hai?

- Heap Snapshot = us moment par V8 heap mein kaunse objects hain aur unhe memory mein kaun hold kar raha hai, uski detailed picture.

- Maan lo heap mein 60,000 objects hain.

- Heap snapshot help karega:
- Kaunse objects zyada memory use kar rahe hain?
- Kya objects repeat ho rahe hain?
- Kaunsa array unhe hold kar raha hai?
- Garbage Collector unhe free kyu nahi kar pa raha?

### Chrome DevTools se Heap Snapshot lo

- Step 1 — Inspector open karo
- Chrome browser mein chrome://inspect open karo.
- Node.js target dikhne par inspect click karo. Chrome DevTools open hoga.

- Step 2 — Memory tab
- DevTools mein Memory tab select karo, phir Heap snapshot select karke snapshot lo.
- Isko Snapshot A naam se identify karo.

- Step 3 — Leak reproduce karo
- Postman se /leak ko 10–20 baar call karo. Phir second heap snapshot lo.
- DevTools ke Comparison view mein newer snapshot ko older snapshot se compare karo.

- Ab table mein objects ke differences dikhenge.

```
Column	    Abhi simple meaning
# New	Naye  objects kitne aaye
# Deleted	  Objects kitne remove hue
# Delta	    Objects count ka net difference
Size Delta	Memory ka net difference
```

- Tumhe Object, Array, string jaise entries dikh sakte hain. Humare demo ke product objects ka count increase hone ki expectation hai.

### Snapshot mein kya dekhna hai?

```
Term	          Simple meaning
Shallow Size	  Object khud kitni memory use karta hai
Retained Size	  Object remove hone par potentially kitni total memory free ho sakti hai
Distance	      GC root se object tak reference path ki approximate length
Retainers	      Kaunse objects/references ise alive rakhe hue hain
Comparison	    Do snapshots ke beech objects/memory ka difference
```

- Hamare example mein tumhe bahut saare Product objects ya unke strings/arrays dikhenge.
- Retaining path kuch aisa ho sakta hai:

```
GC Root
   ↓
Module / Context
   ↓
leakedRequests
   ↓
Array of batches
   ↓
Individual product objects
```

- Aha! Ab tumhe pata chal gaya ki leakedRequests objects ko garbage collection se prevent kar raha hai.
- Yahi Heap Snapshot ka main purpose hai.
- Heap snapshot sirf "memory 500 MB hai" nahi batata—woh explain karne mein help karta hai ki memory kis object graph mein retained hai.

### Heap Snapshot vs Memory Metrics

```
Tool	                Answer
process.memoryUsage()	Kitni memory use ho rahi hai?
Monitoring dashboard	Memory usage kab se badh rahi hai?
Heap Snapshot	        Kaunse objects retained hain aur kyun?
Allocation Profiling	Memory allocate kahan ho rahi hai?
```

- Simple workflow:

```
Memory usage increasing
          ↓
Check heapUsed, RSS, external
          ↓
Reproduce issue with stable workload
          ↓
Take snapshots
          ↓
Compare retained objects
          ↓
Find retaining references
          ↓
Fix code
          ↓
Repeat experiment
```

### Important production warning

- Heap snapshot generate karte waqt Node.js main thread pause ho sakta hai. Snapshot creation substantial extra memory bhi use kar sakti hai—kabhi current heap ke approximately double memory ki zarurat pad sakti hai.
- Isliye large production process par casually snapshot lena application ko freeze ya crash kar sakta hai.
- Hamare local demo mein ye safe learning environment hai.
- Production mein suitable replica, staging reproduction ya carefully planned diagnostic window use karna better hai.
- Snapshots mein sensitive application data bhi ho sakta hai, isliye unhe securely handle karna zaruri hai.

====================================================================================================

====================================================================================================
