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

====================================================================================================
