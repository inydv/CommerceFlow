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

# Backpressure

Imagine karo:

- File Readable Stream bahut fast data read kar rahi hai.
- Client ka network slow hai.
- HTTP response utni speed se data send nahi kar pa raha.
  Agar hum continuously data produce karte rahein, toh memory mein unsent data collect hone lagega.

- Is problem ko handle karne ke mechanism ko Backpressure kehte hain.

- Simple meaning:"Consumer slow hai, toh producer ko bhi slow hona padega."

====================================================================================================
